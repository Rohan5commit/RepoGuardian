# Presentation Script

## 2–3 Minute Judging Script

RepoGuardian is an AI-powered GitHub security and code-risk copilot built for small teams that move fast and often skip security review. Students, hackathon teams, startup engineers, and open-source maintainers regularly ship repositories with leaked secrets, stale dependencies, permissive configs, and weak auth patterns because the review process is too fragmented and too slow.

What RepoGuardian does is compress that first security review into one workflow. A user pastes a public GitHub repository URL, starts a scan, and the system runs a five-agent pipeline: Intake maps the repository, Detection finds high-signal issues, Context grounds them in surrounding code, Remediation uses NVIDIA NIM to explain the risk and suggest fixes, and Prioritization produces the top actions to take now.

Here is the live flow. I can paste a GitHub repo URL, or for a stable demo I can use the built-in vulnerable sample. When I start the scan, the dashboard shows the agent pipeline running. Once the analysis returns, the app surfaces a weighted security score, severity buckets, category breakdown, and the top three actions that matter most for a small team under time pressure.

If I open one of these critical or high findings, you can see that RepoGuardian does not just throw generic warnings at the user. It shows the evidence, the surrounding code, a developer-friendly explanation, and a concrete recommended fix. That means the product is useful not only for detection, but for remediation and communication.

Finally, the report can be exported in markdown, which makes it easy to share with teammates, attach to a project submission, or use as a portfolio artifact.

RepoGuardian is built to win on all four judging criteria: it is innovative because the multi-agent workflow is explicit and productized, functional because it works on live public repos and demo data, polished because the full documentation and presentation assets are included, and practically relevant because insecure repositories are a real problem for the exact teams this event is designed to support.
