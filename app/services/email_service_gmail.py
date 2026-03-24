"""
email_service_gmail.py — Sends reports via Gmail API.
"""

import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

try:
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

def _build_boq_html(boq_data: list) -> str:
    rows = ""
    for item in boq_data:
        rows += f"<tr><td>{item['item_no']}</td><td>{item.get('clean_name')}</td><td>{item['quantity']}</td><td>{item['unit']}</td></tr>"
    return f"<html><body><table>{rows}</table></body></html>"

def send_boq_email(access_token: str, user_email: str, boq_data: list) -> dict:
    if not GOOGLE_API_AVAILABLE:
        return {"success": False, "message": "Google API client not installed"}
    try:
        creds = Credentials(token=access_token)
        service = build("gmail", "v1", credentials=creds)
        message = MIMEMultipart("alternative")
        message["To"] = user_email
        message["Subject"] = "CAD Quantity Takeoff Report"
        message.attach(MIMEText(_build_boq_html(boq_data), "html"))
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        service.users().messages().send(userId="me", body={"raw": raw_message}).execute()
        return {"success": True, "message": "Email sent"}
    except Exception as e:
        return {"success": False, "message": str(e)}
