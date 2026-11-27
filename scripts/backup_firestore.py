"""Daily data backup: dumps the two Firestore documents to a gzip JSON file and uploads it to Google Drive.
The backup is never committed to this (public) repo and never stored as a public workflow artifact."""
import os, sys, json, gzip, time, datetime, urllib.request

API_KEY = os.environ.get("FIREBASE_API_KEY", "AIzaSyCEq-Trf1oFsvPF5tlMvqU83ea_J2DLZjs")  # public web key (also in the apps)
PROJECT = "finance-app-2026-3e318"
DOCS = ["finance_2026/user_ahmed_data", "finance_2026/catalog_data"]

def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    return json.load(urllib.request.urlopen(req, timeout=60))

def main():
    tok = http(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
               b'{"returnSecureToken":true}', {"Content-Type": "application/json"})["idToken"]
    out = {"takenAt": datetime.datetime.utcnow().isoformat() + "Z", "project": PROJECT, "docs": {}}
    for d in DOCS:
        out["docs"][d] = http(f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/{d}",
                              headers={"Authorization": "Bearer " + tok})
    txs = out["docs"][DOCS[0]].get("fields", {}).get("transactions", {}).get("arrayValue", {}).get("values", [])
    if len(txs) < 50:
        print("Refusing to upload: only %d transactions found (looks wrong)" % len(txs)); sys.exit(1)
    name = "daftari_data_%s.json.gz" % datetime.date.today().isoformat()
    with gzip.open(name, "wt", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print("Dumped %d transactions to %s (%d bytes)" % (len(txs), name, os.path.getsize(name)))
    if os.environ.get("DUMP_ONLY"):
        return
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    creds = Credentials.from_authorized_user_info({
        "client_id": os.environ["CLIENT_ID"].strip(), "client_secret": os.environ["CLIENT_SECRET"].strip(),
        "refresh_token": os.environ["REFRESH_TOKEN"].strip(), "token_uri": "https://oauth2.googleapis.com/token"})
    svc = build("drive", "v3", credentials=creds)
    folder = os.environ.get("FOLDER_ID", "").strip()
    meta = {"name": name, "parents": [folder] if folder else []}
    f = svc.files().create(body=meta, media_body=MediaFileUpload(name, mimetype="application/gzip"), fields="id").execute()
    print("Uploaded, Drive file id:", f.get("id"))
    # keep the last 45 daily data backups, delete older ones
    q = "name contains 'daftari_data_' and trashed=false" + (f" and '{folder}' in parents" if folder else "")
    files = svc.files().list(q=q, orderBy="createdTime desc", fields="files(id,name)", pageSize=200).execute().get("files", [])
    for old in files[45:]:
        svc.files().delete(fileId=old["id"]).execute(); print("Deleted old backup", old["name"])

main()
