import tkinter as tk
from tkinter import messagebox, ttk
from PIL import Image, ImageTk
import requests
from dotenv import load_dotenv
import json
# Load environment variables
load_dotenv()

API_URL = "http://localhost:3000/api/chat"
headers = {"Content-Type": "application/json"}

chat_session_id = None  # Global variable to store chatID

def send_message(message, files=None):
    global chat_session_id

    data = {
        "message": message,
        "systemprompt": "Default system prompt here"
    }

    # Attach file if provided
    if files:
        data["files"] = [files]
    # Attach existing chatID if we have it
    if chat_session_id:
        data["chatID"] = chat_session_id

    print("🔄 Sending JSON payload:")
    print(data)

    try:
        response = requests.post(API_URL, json=data, headers=headers)
        print("🔄 Response itself: ",response.text)
        if response.status_code == 200:
            try:
                # Try to read SSE response content
                response_lines = response.text.strip().split("\n\n")
                combined_content = ""

                for line in response_lines:
                    if line.startswith("data: "):
                        json_chunk = line.replace("data: ", "")
                        try:
                            parsed_chunk = json.loads(json_chunk)  # quick and dirty
                            for key, value in parsed_chunk.items():
                                if key == "content":
                                    combined_content += value
                                elif key == "chatID":
                                    chat_session_id = value
                        except Exception as e:
                            print(f"❗ Failed to parse chunk:)# {json_chunk} — {e}")
                print(f"this is final chatID: {chat_session_id}")
                print(f"this is final content: {combined_content}")

                return combined_content.strip() if combined_content else "No content in response."
            except ValueError:
                print("❗ response code not 200")
                return response.text
        else:
            return f"Error: {response.status_code}\n{response.text}"
    except requests.exceptions.RequestException as e:
        return f"Request failed: {e}"


class ChatApp:
    def __init__(self, root):
        self.root = root
        self.root.title("💬 Chat API GUI")
        self.root.geometry("1024x768")
        self.set_background_image()

        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Fancy.TLabel", font=("Segoe UI Semibold", 13), foreground="#ffffff", background="#444")
        style.configure("Fancy.TEntry", padding=6)

        self.input_frame = tk.Frame(self.root, bg="#000000", bd=0)
        self.input_frame.pack(fill="x", pady=20, padx=50)

        # Label & Input for Message
        self.message_label = tk.Label(self.input_frame, text="💬 Message:", font=("Segoe UI", 14, "bold"), fg="#fff", bg="#000")
        self.message_label.grid(row=0, column=0, sticky="w", pady=8)

        self.message_entry = tk.Entry(self.input_frame, font=("Segoe UI", 12), bg="#eeeeee", fg="#222", relief="flat", width=60, bd=0, highlightcolor="#4CAF50", highlightthickness=2)
        self.message_entry.grid(row=0, column=1, pady=8, ipady=6, padx=10)

        # Label & Input for File
        self.file_label = tk.Label(self.input_frame, text="📎 File Path (optional):", font=("Segoe UI", 14, "bold"), fg="#fff", bg="#000")
        self.file_label.grid(row=1, column=0, sticky="w", pady=8)

        self.file_entry = tk.Entry(self.input_frame, font=("Segoe UI", 12), bg="#eeeeee", fg="#222", relief="flat", width=60, bd=0, highlightcolor="#FF5722", highlightthickness=2)
        self.file_entry.grid(row=1, column=1, pady=8, ipady=6, padx=10)

        # Button Frame
        self.button_frame = tk.Frame(self.root, bg="#000")
        self.button_frame.pack(pady=10)

        self.send_button = self.create_rounded_button(self.button_frame, "🚀 Send", self.on_send, "#4CAF50", "white")
        self.send_button.pack(side="left", padx=15)

        self.clear_button = self.create_rounded_button(self.button_frame, "🧹 Clear", self.on_clear, "#FF5722", "white")
        self.clear_button.pack(side="left", padx=15)

        # Output Text Box
        self.response_text = tk.Text(self.root, font=("Consolas", 12), height=15, width=100, bg="#1e1e1e", fg="#00FFAA", insertbackground="white", relief="flat", bd=5)
        self.response_text.pack(pady=20)
        self.response_text.config(state="disabled")

    def set_background_image(self):
        try:
            bg_image = Image.open("bub2.jpg")
            bg_image = bg_image.resize((1024, 768), Image.Resampling.LANCZOS)
            bg_photo = ImageTk.PhotoImage(bg_image)
            self.bg_label = tk.Label(self.root, image=bg_photo)
            self.bg_label.place(relwidth=1, relheight=1)
            self.bg_label.image = bg_photo
        except Exception as e:
            print(f"Error loading background image: {e}")
            messagebox.showerror("Image Error", f"Could not load the background image. {e}")

    def create_rounded_button(self, parent, text, command, color, text_color):
        button = tk.Button(parent, text=text, command=command, font=("Segoe UI", 12, "bold"),
                           bg=color, fg=text_color, activebackground=color, activeforeground="white",
                           relief="flat", width=15, height=2, bd=0, cursor="hand2", padx=10, pady=5)
        button.bind("<Enter>", lambda e: button.config(bg=self.darken(color)))
        button.bind("<Leave>", lambda e: button.config(bg=color))
        return button

    def darken(self, hex_color):
        hex_color = hex_color.lstrip('#')
        r, g, b = [int(hex_color[i:i+2], 16) for i in (0, 2 ,4)]
        r, g, b = max(0, r - 20), max(0, g - 20), max(0, b - 20)
        return f'#{r:02x}{g:02x}{b:02x}'

    def on_send(self):
        message = self.message_entry.get()
        file_url = self.file_entry.get()

        if not message:
            messagebox.showwarning("Input Error", "Please enter a message.")
            return

        self.response_text.config(state="normal")
        self.response_text.delete(1.0, tk.END)
        self.response_text.insert(tk.END, "⏳ Sending message...\n")
        self.response_text.config(state="disabled")

        response = send_message(message, file_url if file_url else None)

        self.response_text.config(state="normal")
        self.response_text.delete(1.0, tk.END)
        self.response_text.insert(tk.END, str(response))
        self.response_text.config(state="disabled")

    def on_clear(self):
        self.message_entry.delete(0, tk.END)
        self.file_entry.delete(0, tk.END)
        self.response_text.config(state="normal")
        self.response_text.delete(1.0, tk.END)
        self.response_text.config(state="disabled")

# Run the GUI
if __name__ == "__main__":
    root = tk.Tk()
    app = ChatApp(root)
    root.mainloop()
