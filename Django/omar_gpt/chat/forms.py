from django import forms

class ChatForm(forms.Form):
    message = forms.CharField(label="💬 Message", max_length=1000, widget=forms.TextInput(attrs={
        'class': 'form-control', 'placeholder': 'Type your message here...'
    }))
    file_url = forms.URLField(label="📎 File Path (optional)", required=False, widget=forms.URLInput(attrs={
        'class': 'form-control', 'placeholder': 'Paste file URL here...'
    }))
