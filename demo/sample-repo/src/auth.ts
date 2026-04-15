import jwt from "jsonwebtoken";

export function saveToken(token: string) {
  localStorage.setItem("session_token", token);
}

export function issueToken(payload: { email: string; role: string }) {
  return jwt.sign(payload, "hackathon-demo-secret", { expiresIn: "30d" });
}

export function readToken(token: string) {
  return jwt.decode(token);
}
