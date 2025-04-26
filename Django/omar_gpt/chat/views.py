import os
import uuid
import requests
import json

from django.shortcuts import render, redirect
from .forms import ChatForm
from dotenv import load_dotenv

load_dotenv()

API_URL = "http://localhost:3000/api/chat"
headers = {"Content-Type": "application/json"}

# Directory to store chat logs
CHAT_LOG_DIR = os.path.join(os.path.dirname(__file__), 'chat_sessions')
if not os.path.exists(CHAT_LOG_DIR):
    os.makedirs(CHAT_LOG_DIR)

# --- Utility Functions ---

def generate_chat_id():
    return str(uuid.uuid4())

def get_chat_log_path(chat_id):
    return os.path.join(CHAT_LOG_DIR, f"{chat_id}.txt")

def save_to_chat_log(chat_id, prompt, response):
    file_path = get_chat_log_path(chat_id)
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(f"User: {prompt}\n")
        f.write(f"Bot: {response}\n")

def get_full_chat_history(chat_id):
    file_path = get_chat_log_path(chat_id)
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def list_chat_ids():
    if not os.path.exists(CHAT_LOG_DIR):
        return []
    return [f.replace(".txt", "") for f in os.listdir(CHAT_LOG_DIR) if f.endswith(".txt")]

# --- API call with full context ---

def send_message(message, file_url=None):
    data = {
        "message": message,
        "systemprompt": "Default system prompt here"
    }

    if file_url:
        data["files"] = [file_url]

    print("\n🟢 SENDING TO API:")
    print("==== BEGIN PROMPT ====")
    print(message)
    print("==== END PROMPT ====\n")
    try:
        response = requests.post(API_URL, json=data, headers=headers)
        if response.status_code == 200:
            response_lines = response.text.strip().split("\n\n")
            combined_content = ""
            chat_id_found = None

            for line in response_lines:
                if line.startswith("data: "):
                    json_chunk = line.replace("data: ", "")
                    parsed_chunk = json.loads(json_chunk)
                    for key, value in parsed_chunk.items():
                        if key == "content":
                            combined_content += value
                        elif key == "chatID":
                            chat_id_found = value
            return combined_content.strip() if combined_content else "No content in response."
        else:
            return f"❌ Error {response.status_code}: {response.text}"
    except requests.exceptions.RequestException as e:
        return f"🚫 Request failed: {e}"

# --- Main View ---

def chat_view(request):
    chat_id = request.GET.get("chat_id")

    # Handle "New Chat" action
    if request.method == "POST" and "new_chat" in request.GET:
        new_id = generate_chat_id()
        return redirect(f"/?chat_id={new_id}")

    # No chat_id provided? Start a new one
    if not chat_id:
        return redirect(f"/?chat_id={generate_chat_id()}")

    response = None

    if request.method == "POST" and "new_chat" not in request.GET:
        form = ChatForm(request.POST)
        if form.is_valid():
            prompt = form.cleaned_data["message"]
            file_url = form.cleaned_data.get("file_url")
            history = get_full_chat_history(chat_id)
            full_prompt = f"{history}\nUser: {prompt}".strip()
            response = send_message(full_prompt, file_url)
            save_to_chat_log(chat_id, prompt, response)
    else:
        form = ChatForm()

    return render(request, "chat/chat.html", {
        "form": form,
        "response": response,
        "chat_ids": list_chat_ids(),
        "current_chat": chat_id
    })
