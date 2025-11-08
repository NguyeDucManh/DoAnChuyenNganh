# accounts/forms.py
from django import forms
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth import get_user_model

class StrictPasswordResetForm(PasswordResetForm):
    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        User = get_user_model()
        if not User.objects.filter(email__iexact=email, is_active=True).exists():
            raise forms.ValidationError("Email không đúng hoặc chưa đăng ký.")
        return email
