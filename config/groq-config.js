import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "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",
});

export default groq;