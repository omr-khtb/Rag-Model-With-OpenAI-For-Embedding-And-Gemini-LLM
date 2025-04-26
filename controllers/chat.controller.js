import { v4 as uuidv4 } from "uuid";
import {
  getGEMINIChatStream,
  processUserMessage,

} from "../helpers/chatHelper.js";

export const openSourceRAGModelChat = async (req, res) => {
  try {
    const { systemprompt, message, files } = req.body;

    if (!message && (!files || files.length === 0)) {
      return res.status(400).json({ message: "Message or files are required" });
    }

    const chatID = req.body.chatID || uuidv4();
    console.log("Chat ID:", chatID);
    console.log("System Prompt:", message);

    let fileContent = "";
    if (files && files.length > 0) {
      fileContent = await processUserMessage(message, files, chatID);
    }

    const groqMessages = [{ role: "user", content: message || "" }];
    if (fileContent) {
      groqMessages.push({ role: "user", content: fileContent });
    }

    const assistantMessageContent = await getGEMINIChatStream(
      groqMessages,
      systemprompt || ""
    );

    let assistantMessageContentString = "";
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of assistantMessageContent) {
      const contentChunk = chunk.choices[0]?.delta?.content || "";
      assistantMessageContentString += contentChunk;
      res.write(`data: ${JSON.stringify({ content: contentChunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true, chatID })}\n\n`);
    res.end();
  } catch (error) {
    console.error("Error testing chat", error);
   // res.status(500).json({ message: "Internal server error" });
   res.write(`data: ${JSON.stringify({ error: "Internal server error" })}\n\n`);
   res.end();
  }
};


export default openSourceRAGModelChat;