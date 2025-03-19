import { handleGenerateIdeas } from "./handle-generate-ideas.js";
import { handleVisualizeGraph } from "./handle-visualize-graph.js";

// Function to update URL parameters without reload
function updateURLParams(owner, repo) {
  const url = new URL(window.location.href);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  window.history.pushState({}, "", url.toString());
}

document.addEventListener("DOMContentLoaded", () => {
  // Load token from localStorage
  const tokenInput = document.getElementById("token");
  const storedToken = localStorage.getItem("issue-graph:access-token");
  if (storedToken) {
    tokenInput.value = storedToken;
  }

  // Load OpenAI API key from localStorage
  const openaiApiKeyInput = document.getElementById("openai-api-key");
  const storedOpenaiApiKey = localStorage.getItem("graph-visualizer:openai-api-key");
  if (storedOpenaiApiKey) {
    openaiApiKeyInput.value = storedOpenaiApiKey;
  }

  // Load owner and repo from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const ownerInput = document.getElementById("owner");
  const repoInput = document.getElementById("repo");

  const urlOwner = urlParams.get("owner");
  const urlRepo = urlParams.get("repo");

  if (urlOwner) {
    ownerInput.value = urlOwner;
  }
  if (urlRepo) {
    repoInput.value = urlRepo;
  }
});

handleVisualizeGraph();
handleGenerateIdeas();

// initial form values
const ownerInput = document.getElementById("owner");
const repoInput = document.getElementById("repo");
const tokenInput = document.getElementById("token");
const openaiApiKeyInput = document.getElementById("openai-api-key");

ownerInput.addEventListener("input", () => {
  updateURLParams(ownerInput.value, repoInput.value);
});

repoInput.addEventListener("input", () => {
  updateURLParams(ownerInput.value, repoInput.value);
});

tokenInput.addEventListener("input", () => {
  localStorage.setItem("issue-graph:access-token", tokenInput.value);
});

openaiApiKeyInput.addEventListener("input", () => {
  localStorage.setItem("graph-visualizer:openai-api-key", openaiApiKeyInput.value);
});
