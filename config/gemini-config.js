// config/gemini-config.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// Check if the environment variable GEMINI_API is present, otherwise log an error or use a fallback value
const geminiApiKey = process.env.GEMINI_API || "AIzaSyBsP0F2eesaU04XN241l35zO8errJD3-ok";

console.log(`Using Gemini API key: ${geminiApiKey}`);

const genAI = new GoogleGenerativeAI(geminiApiKey);

export default genAI;
