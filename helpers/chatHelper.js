import axios from "axios";
import groq from "../config/groq-config.js";
import gpt from "../config/openai-config.js";
import genAI from "../config/gemini-config.js";
import { supabaseClient } from "../config/supabase.js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import { PPTXLoader } from "@langchain/community/document_loaders/fs/pptx";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";

const embedding_model = new OpenAIEmbeddings({ apiKey: process.env.apiKey });

const DEFAULT_SYSTEM_PROMPT =
  `You are Neena, an AI Assistant developed by Omar Khattab to help student know about certain topic` +
  `Now's Date and time:  ${new Date().toLocaleString()}`;

export async function analyzeImageWithGroq(imageUrl, message) {
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("Invalid image URL");
  }

  const default_prompt = "Describe the image";

  try {
    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: message || default_prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 1,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });

    return response.choices[0]?.message?.content || "No content returned";
  } catch (error) {
    console.error("Groq API error:", error.response?.data || error.message);
    throw error;
  }
}

export async function analyzeAudioWithGroq(audioUrl, message) {
  if (!audioUrl || typeof audioUrl !== "string") {
    throw new Error("Invalid audio URL");
  }

  try {
    const response = await groq.audio.transcriptions.create({
      model: "whisper-large-v3-turbo",
      url: audioUrl,
      prompt: message || "Transcribe this audio/video",
    });

    return response.text || "No content returned";
  } catch (error) {
    console.error("Groq API error:", error.response?.data || error.message);
    throw error;
  }
}

import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

async function fetchDocumentContent(url, chatId) {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const fileBlob = new Blob([response.data]);

    let loader;

    if (url.endsWith(".pdf")) {
      // ✨ New: use EasyOCR Python API instead of WebPDFLoader
      console.log("Using EasyOCR API to extract text from PDF:", url);

      // Save PDF temporarily
      const tempFilePath = path.join("./", `temp_${Date.now()}.pdf`);
      fs.writeFileSync(tempFilePath, Buffer.from(await fileBlob.arrayBuffer()));

      // Send to Python API
      const formData = new FormData();
      formData.append("file", fs.createReadStream(tempFilePath));

      const ocrResponse = await axios.post(
        "http://localhost:5000/extract-text/", // Your Python API URL
        formData,
        { headers: formData.getHeaders() }
      );

      // Clean up the temp file
      fs.unlinkSync(tempFilePath);

      const extractedText = ocrResponse.data.extracted_text;

      if (!extractedText || extractedText.trim() === "") {
        throw new Error("No text extracted from PDF using OCR.");
      }

      const metadata = { url, chatId };

      return [
        {
          pageContent: extractedText.replace(/\s+/g, " ").trim(),
          metadata,
        },
      ];
    } 
    else if (url.endsWith(".docx")) {
      loader = new DocxLoader(fileBlob);
    } 
    else if (url.endsWith(".pptx")) {
      loader = new PPTXLoader(fileBlob);
    } 
    else {
      throw new Error("Unsupported file type.");
    }

    // 🛑 Commenting this part out for PDFs:
    /*
    if (url.endsWith(".pdf")) {
      loader = new WebPDFLoader(fileBlob);
    }
    */

    const documents = await loader.load();

    if (!documents || documents.length === 0) {
      throw new Error("No content extracted from the document.");
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1250,
      chunkOverlap: 250,
    });

    const splitDocuments = await splitter.splitDocuments(documents);

    const content = splitDocuments.map((doc) => {
      const text = doc.pageContent || "";
      const metadata = { ...doc.metadata, chatId };
      return {
        pageContent: text.replace(/\s+/g, " ").trim(),
        metadata,
      };
    });

    return content;
  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
}


// Cosine similarity calculation
function calculateCosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  return dotProduct / (norm1 * norm2);
}

// Basic TF-IDF implementation for keyword matching
function calculateKeywordRelevance(query, content) {
  if (!query || !content) return 0;

  const queryTerms = query.toLowerCase().split(/\s+/);
  const contentTerms = content.toLowerCase().split(/\s+/);

  let score = 0;
  const contentLength = contentTerms.length;

  queryTerms.forEach((term) => {
    // Term frequency in content
    const termFrequency =
      contentTerms.filter((t) => t === term).length / contentLength;

    // Simple inverse document frequency (could be pre-computed in production)
    const termRarity = Math.log(1 + 1 / (1 + termFrequency));

    score += termFrequency * termRarity;
  });

  return score;
}

export async function processAndEmbedDocuments(urls, chatId) {
  const batchSize = 5; // Process in smaller batches
  const chunks = [];

  for (const url of urls) {
    try {
      const content = await fetchDocumentContent(url, chatId);
      chunks.push(...content);
    } catch (error) {
      console.error(`Error processing document at ${url}:`, error.message);
    }
  }

  // Process in batches to avoid overwhelming the database
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (chunk) => {
        const embedding = await embedding_model.embedQuery(chunk.pageContent);

        // Insert document into Supabase
        const { data, error } = await supabaseClient.from("documents").insert({
          chatId,
          content_url: chunk.metadata.url,
          content: chunk.pageContent,
          metadata: chunk.metadata,
          embedding,
          created_at: new Date().toISOString(),
        });

        if (error) {
          console.error("Error inserting into Supabase:", error.message);
        } else {
          console.log("Document inserted successfully:", data);
        }
      })
    );
  }
}


export async function getRelevantDocuments(query, chatId, maxResults = 5) {
  try {
    const { data: allDocuments, error: fetchError } = await supabaseClient
      .from("documents")
      .select("*")
      .eq("metadata->>chatId", chatId);

    if (fetchError) throw fetchError;
    if (!allDocuments?.length) return [];

    // Generate embedding for the query
    const queryEmbedding = await embedding_model.embedQuery(query);

    // Perform hybrid search using both semantic similarity and keyword matching
    const rankedResults = allDocuments.map((doc) => {
      const similarity = calculateCosineSimilarity(
        queryEmbedding,
        doc.embedding
      );

      // Calculate keyword relevance (basic TF-IDF)
      const keywordScore = calculateKeywordRelevance(query, doc.content);

      // Combine scores with weights
      const finalScore = similarity * 0.7 + keywordScore * 0.3;

      return {
        url: doc.content_url,
        content: doc.content,
        metadata: doc.metadata,
        similarity: finalScore,
      };
    });

    return rankedResults
      .sort((a, b) => a.similarity - b.similarity)
      .reverse()
      .slice(0, maxResults);
  } catch (error) {
    console.error("Error in getRelevantDocuments:", error);
    return [];
  }
}

export async function getGroqChatStream(
  messages,
  system_prompt = DEFAULT_SYSTEM_PROMPT
) {
  const systemPrompt = {
    role: "system",
    content: system_prompt,
  };

  const availableModels = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-4096",
    "llama-3.3-70b-specdec",
    "gemma2-9b-it",
  ];

  const tryModels = async (messages) => {
    for (let model of availableModels) {
      try {
        console.log(model);
        const response = await groq.chat.completions.create({
          messages: [systemPrompt, ...messages],
          model: model,
          stop: null,
          stream: true,
        });

        return response;
      } catch (error) {
        console.error(`Error with model ${model}:`, error.message);
      }
    }
    return null;
  };

  let response = await tryModels(messages.slice(-10));

  if (!response) {
    response = await tryModels(messages.slice(-5));
  }

  return response;
}

export async function getGEMINIChatStream(
  messages,
  system_prompt = DEFAULT_SYSTEM_PROMPT
) {
  try {
    messages = messages.slice(-10);

    const formattedHistory = messages
      .filter((msg, index) => !(index === 0 && msg.role === "assistant"))
      .slice(0, -1)
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

    const currentMessage = messages[messages.length - 1];

    const availableModels = [
      //"gemini-2.5-pro-exp-03-25",
      //"gemini-2.0-flash-thinking-exp-01-21",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
    ];

    const generationConfig = {
      temperature: 1,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 65536,
      responseModalities: [],
      responseMimeType: "text/plain",
    };
    for (let model of availableModels) {
      try {
        const chat = genAI
          .getGenerativeModel({
            model: model,
            systemInstruction: system_prompt,
          })
          .startChat({
            history: formattedHistory,
            generationConfig,
          });

        const result = await chat.sendMessageStream(currentMessage.content);

        async function* formatStream() {
          try {
            let tokensUsed = 0;
            for await (const chunk of result.stream) {
              const chunkText = chunk.text();
              tokensUsed += chunkText.length;
              yield {
                choices: [
                  {
                    delta: {
                      content: chunkText,
                    },
                    finish_reason: null,
                  },
                ],
                usage: {
                  total_tokens: tokensUsed,
                },
              };
            }
            // Send final chunk with finish_reason
            yield {
              choices: [
                {
                  delta: {
                    content: "",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                total_tokens: tokensUsed,
              },
            };
          } catch (error) {
            console.error("Error in Gemini stream:", error);
            return null;
          }
        }

        console.log("GEMINI");

        return formatStream();
      } catch (error) {
        console.error(`Error with model ${model}:`, error.message);
      }
    }

    console.log("All models failed.");
    return null;
  } catch (error) {
    console.error("Error in getGEMINIChatStream:", error);
    return null;
  }
}

export async function getGPTChatStream(
  messages,
  system_prompt = DEFAULT_SYSTEM_PROMPT
) {
  const systemPrompt = {
    role: "system",
    content: system_prompt,
  };

  messages = messages.slice(-10);

  return gpt.chat.completions.create({
    messages: [systemPrompt, ...messages],
    model: "gpt-4o-mini",
    stop: null,
    stream: true,
    stream_options: {
      include_usage: true,
    },
  });
}

export async function checkUserLimit(user) {
  const currentDate = new Date();
  const lastRequestDate = new Date(user.request.lastRequestDate);
  
  // Calculate time difference in milliseconds
  const timeDifference = currentDate - lastRequestDate;
  const resetTimeInMs = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
  const remainingTimeInMs = resetTimeInMs - timeDifference;
  
  // Calculate hours and minutes
  const remainingHours = Math.floor(remainingTimeInMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingTimeInMs % (1000 * 60 * 60)) / (1000 * 60));

  // Format time message
  const formatTimeMessage = () => {
    if (remainingHours <= 0 && remainingMinutes <= 0) {
      return "less than a minute";
    }
    
    const hourText = remainingHours > 0 
      ? `${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}` 
      : '';
    const minuteText = remainingMinutes > 0 
      ? `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}` 
      : '';
    
    if (hourText && minuteText) {
      return `${hourText} and ${minuteText}`;
    }
    return hourText || minuteText;
  };

  // Reset if 3 or more hours have passed
  if (timeDifference >= resetTimeInMs) {
    user.request.promptsUsedToday = 0;
    user.request.lastRequestDate = currentDate;
    user.request.total_tokens = 0;
    await user.save();
  }

  if (user.payment.plan === "free" && user.request.promptsUsedToday >= 10) {
    return {
      limitReached: true,
      message: `You've reached your limit of requests for the 3-hour window. Your limit will reset in ${formatTimeMessage()}. 
                Want unlimited access? <a href="/pricing" style="color:blue;">Upgrade to Plus</a> to remove these restrictions!`,
    };
  }

  if (user.payment.plan === "plus" && user.request.total_tokens >= user.request.max_tokens) {
    return {
      limitReached: true,
    };
  }

  return { limitReached: false };
}

export async function GroqChat(messages, system_prompt) {
  const systemPrompt = {
    role: "system",
    content: system_prompt,
  };

  const availableModels = [
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-4096",
    "llama-3.3-70b-specdec",
    "gemma2-9b-it",
  ];

  for (let model of availableModels) {
    try {
      const response = await groq.chat.completions.create({
        messages: [systemPrompt, ...messages],
        model: model,
        stop: null,
      });

      return response;
    } catch (error) {
      console.error(`Error with model ${model}:`, error.message);
    }
  }
  throw new Error("All models failed.");
}

async function analyzeAndProcessFiles(files, message, chatId) {
  let fileContent = "";

  for (const file of files) {
    const fileType = file.split(".").pop().toLowerCase();
    try {
      if (["jpg", "jpeg", "png", "gif", "webp"].includes(fileType)) {
        const imageAnalysis = await analyzeImageWithGroq(file, message);
        fileContent += `\n[Image Content: ${file}\n${imageAnalysis}]\n`;
      } else if (["pdf", "txt", "docx"].includes(fileType)) {
        await processAndEmbedDocuments([file], chatId);
        const relevantDocs = await getRelevantDocuments(message, chatId);
        fileContent += relevantDocs
          .map((doc) => `[Relevant Document: ${doc.content}]`)
          .join("\n");
      } else if (
        [
          "flac",
          "mp3",
          "mp4",
          "mpeg",
          "mpga",
          "m4a",
          "ogg",
          "wav",
          "webm",
        ].includes(fileType)
      ) {
        //Maximum 40MB
        if (file.size > 40 * 1024 * 1024) {
          fileContent += `\n[File: ${file}]\nFile size exceeds the limit of 40MB.\n`;
          continue;
        }
        const audioAnalysis = await analyzeAudioWithGroq(file, message);
        fileContent += `\n[Audio Content: ${audioAnalysis}]\n`;
      } else {
        fileContent += `\n[File: ${file}]\nUnsupported file type.\n`;
      }
    } catch (error) {
      console.error(`Error processing file: ${file}`, error);
      fileContent += `\n[File: ${file}]\nFailed to process.\n`;
    }
  }

  return fileContent;
}

export const processUserMessage = async (message, files, chatId) => {
  let fileContent = "";

  
  console.log("wer are here");
  if (files && files.length > 0) {
    if (files.length > 3) {
      throw new Error("Maximum 3 files allowed");
    }
    const newFileContent = await analyzeAndProcessFiles(files, message, chatId);
    fileContent += `\n${newFileContent}`;
  }
  else{
    console.log("No files provided, fetching existing documents...");
    fileContent = await fetchExistingDocuments(chatId, message);
  }

  console.log("File content:", fileContent);
  return fileContent;
};


export const prepareGroqMessages = (chat, message, fileContent) => {
  const combinedContent = `${message}\n${fileContent}\n`;

  return chat
    ? [
        ...chat.messages.map((msg) => ({
          role: msg.role,
          content: msg.content + (msg.filesContent || ""),
        })),
        { role: "user", content: combinedContent },
      ]
    : [{ role: "user", content: combinedContent }];
};

export const getAIResponse = async (plan, groqMessages, limitReached) => {
  const assistantMessageContent =
    plan === "free"
      ? await getGEMINIChatStream(groqMessages)
      : !limitReached
      ? await getGEMINIChatStream(groqMessages) // Add await getGPTChatStream(groqMessages) Instead 
      : await getGEMINIChatStream(groqMessages);

  if (!assistantMessageContent) {
    throw new Error("Unable to process request");
  }

  return assistantMessageContent;
};

export const createNewChat = (
  chatId,
  message,
  files,
  fileContent,
  assistantContent
) => {
  const newMessages = [
    {
      role: "user",
      content: message,
      files,
      filesContent: fileContent,
      createdAt: new Date(),
    },
    {
      role: "assistant",
      content: assistantContent,
      createdAt: new Date(),
    },
  ];

  return {
    chatId,
    title: message.slice(0, 20),
    messages: newMessages,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

export const updateExistingChat = (
  chat,
  message,
  files,
  fileContent,
  assistantContent
) => {
  const newMessages = [
    {
      role: "user",
      content: message,
      files,
      filesContent: fileContent,
      createdAt: new Date(),
    },
    {
      role: "assistant",
      content: assistantContent,
      createdAt: new Date(),
    },
  ];

  chat.messages.push(...newMessages);
  chat.updatedAt = new Date();
  return chat;
};


export async function fetchExistingDocuments(chatId, message) {
  try {
    const hasDocuments = await hasDocumentsForChatId(chatId);

    if (!hasDocuments) {
      console.log(`No documents found for chatId: ${chatId}`);
      return "";
    }

    console.log(`Documents exist, now fetching relevant documents for chatId: ${chatId}`);
    
    const relevantDocs = await getRelevantDocuments(message, chatId);

    if (!relevantDocs || relevantDocs.length === 0) {
      return "";
    }

    return relevantDocs
      .map((doc) => `[Relevant Document]:\n${doc.content}`)
      .join("\n\n");
  } catch (error) {
    console.error("Error fetching documents:", error.message);
    return "";
  }
}


export async function hasDocumentsForChatId(chatId) {
  try {
    const { data, error } = await supabaseClient
      .from("documents")
      .select("id") // ✅ Only fetch IDs (not full document contents)
      .eq("metadata->>chatId", chatId)
      .limit(1); // ✅ We just want to know if any exist

    if (error) throw error;

    return (data && data.length > 0);
  } catch (error) {
    console.error("Error checking documents:", error.message);
    return false;
  }
}
