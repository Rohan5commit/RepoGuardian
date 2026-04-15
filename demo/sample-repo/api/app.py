from flask import Flask

app = Flask(__name__)


@app.route("/internal/health")
def internal_health():
    return {"status": "ok", "debug": True}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
