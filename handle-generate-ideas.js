import { fetchIssueData } from "./fetch-graph-data.js";

export function handleGenerateIdeas() {
  document.getElementById("generateIdeas").addEventListener("click", async () => {
    const owner = document.getElementById("owner").value.trim();
    const repo = document.getElementById("repo").value.trim();
    const token = document.getElementById("token").value.trim();
    const errorElement = document.getElementById("error");
    const loadingElement = document.getElementById("loading");

    // Validate inputs
    if (!owner || !repo || !token) {
      errorElement.textContent = "Please fill in all fields.";
      errorElement.style.display = "block";
      return;
    }

    errorElement.style.display = "none";
    loadingElement.style.display = "block";
    document.getElementById("ideas").innerHTML = "";

    try {
      const issueData = await fetchIssueData(owner, repo, token);
      document.getElementById("ideas").textContent = JSON.stringify(issueData);
    } catch (error) {
      errorElement.textContent = `Error: ${error.message}`;
      errorElement.style.display = "block";
      console.error(error);
    } finally {
      loadingElement.style.display = "none";
    }
  });
}
