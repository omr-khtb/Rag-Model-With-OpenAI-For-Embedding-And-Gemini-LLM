import os
import requests
import json
import uuid
import re

from django.shortcuts import render, redirect
from django.http import HttpResponse
from .forms import ChatForm
from dotenv import load_dotenv

# Arabic reshaper
import arabic_reshaper
from bidi.algorithm import get_display

load_dotenv()

API_URL = "http://localhost:3000/api/chat"
headers = {"Content-Type": "application/json"}

CHAT_LOG_DIR = os.path.join(os.path.dirname(__file__), 'chat_sessions')
TITLES_FILE = os.path.join(CHAT_LOG_DIR, 'chat_titles.json')

# Ensure folders exist
os.makedirs(CHAT_LOG_DIR, exist_ok=True)

# Arabic helper
def contains_arabic(text):
    return bool(re.search(r'[\u0600-\u06FF]', text))

def fix_arabic(text):
    try:
        if contains_arabic(text):
            reshaped = arabic_reshaper.reshape(text)
            bidi_text = get_display(reshaped)
            return bidi_text
        else:
            return text
    except Exception:
        return text

# Utilities
def get_chat_log_path(chat_id):
    return os.path.join(CHAT_LOG_DIR, f"{chat_id}.txt")

def save_to_chat_log(chat_id, prompt, response):
    file_path = get_chat_log_path(chat_id)
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(f"User: {prompt}\n")
        f.write(f"GPT: {response}\n")

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

def load_titles():
    if os.path.exists(TITLES_FILE):
        with open(TITLES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_titles(titles):
    with open(TITLES_FILE, "w", encoding="utf-8") as f:
        json.dump(titles, f, ensure_ascii=False, indent=2)

def set_chat_title(chat_id, response_text):
    titles = load_titles()
    if chat_id not in titles:
        first_words = " ".join(response_text.strip().split()[:3])
        titles[chat_id] = first_words or "Untitled"
        save_titles(titles)

# API call
def send_message(message, file_url=None, current_chat_id=None):
    data = {
        "message": message,
        "systemprompt": "Default system prompt here"
    }

    if file_url:
        data["files"] = [file_url]

    if current_chat_id:
        data["chatID"] = current_chat_id

    print("\n🔵 Sending Prompt to API:")
    print(message)
    print("🔵 End Prompt\n")

    try:
        response = requests.post(API_URL, json=data, headers=headers)

        # 🛠️ Force correct decoding to UTF-8
        response.encoding = 'utf-8'

        print("\n🔴 Full RAW API Response:")
        print(response.text)
        print("🔴 End of API Response\n")

        if response.status_code == 200:
            response_lines = response.text.strip().split("\n\n")
            combined_content = ""
            api_chat_id = current_chat_id

            for line in response_lines:
                if line.startswith("data: "):
                    json_chunk = line.replace("data: ", "")
                    parsed_chunk = json.loads(json_chunk)
                    for key, value in parsed_chunk.items():
                        if key == "content":
                            combined_content += value
                        elif key == "chatID":
                            api_chat_id = value

            return combined_content.strip(), api_chat_id
        else:
            return f"❌ Error {response.status_code}: {response.text}", current_chat_id
    except requests.exceptions.RequestException as e:
        return f"🚫 Request failed: {e}", current_chat_id

# Main Chat View
def chat_view(request):
    chat_id = request.GET.get("chat_id")
    current_chat_id = chat_id

    delete_id = request.GET.get("delete_chat")
    rename_id = request.GET.get("rename_chat")
    download_id = request.GET.get("download_chat")

    # Download Chat
    if download_id:
        file_path = get_chat_log_path(download_id)
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                response = HttpResponse(f.read(), content_type='text/plain; charset=utf-8')
                response['Content-Disposition'] = 'attachment; filename="chat_{}.txt"'.format(download_id[:8])
                return response
        else:
            return redirect(f"/?chat_id={download_id}")

    # Delete Chat
    if delete_id:
        file_path = get_chat_log_path(delete_id)
        if os.path.exists(file_path):
            os.remove(file_path)
        titles = load_titles()
        if delete_id in titles:
            del titles[delete_id]
            save_titles(titles)
        return redirect("/")

    # Rename Chat
    if rename_id and request.method == "POST":
        new_title = request.POST.get("new_title", "").strip()
        if new_title:
            titles = load_titles()
            titles[rename_id] = new_title
            save_titles(titles)
        return redirect(f"/?chat_id={rename_id}")

    # New Chat
    if request.method == "POST" and "new_chat" in request.GET:
        return redirect("/")

    # Sending Message
    if request.method == "POST" and "new_chat" not in request.GET:
        form = ChatForm(request.POST)
        if form.is_valid():
            prompt = form.cleaned_data["message"]
            file_url = form.cleaned_data.get("file_url")

            history = ""
            if current_chat_id:
                history = get_full_chat_history(current_chat_id)

            full_prompt = f"{history}\nUser: {prompt}".strip()

            response, new_chat_id = send_message(full_prompt, file_url, current_chat_id)

            if not current_chat_id and new_chat_id:
                current_chat_id = new_chat_id
                return redirect(f"/?chat_id={current_chat_id}")

            save_to_chat_log(current_chat_id, prompt, response)
            set_chat_title(current_chat_id, response)
    else:
        form = ChatForm()

    # Load chat history
    chat_messages = []
    if current_chat_id:
        raw_history = get_full_chat_history(current_chat_id)
        chat_lines = raw_history.strip().split("\n")
        # Reshape only for displaying
        chat_messages = list(reversed(chat_lines))  # newest first

    all_chat_ids = list_chat_ids()
    all_chat_ids.sort(reverse=True)

    return render(request, "chat/chat.html", {
        "form": form,
        "chat_ids": all_chat_ids,
        "chat_titles": load_titles(),
        "current_chat": current_chat_id,
        "chat_messages": chat_messages,
    })
