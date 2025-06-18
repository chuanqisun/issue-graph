import { fetchIssueData } from "./fetch-graph-data.js";

export async function handleGenerateIdeas() {
  document.getElementById("generateIdeas").addEventListener("click", async () => {
    const owner = document.getElementById("owner").value.trim();
    const repo = document.getElementById("repo").value.trim();
    const token = document.getElementById("token").value.trim();
    const apiKey = document.getElementById("openai-api-key").value.trim();
    const errorElement = document.getElementById("error");
    const loadingElement = document.getElementById("loading");

    // Validate inputs
    if (!owner || !repo || !apiKey) {
      errorElement.textContent = "Please fill in all fields.";
      errorElement.style.display = "block";
      return;
    }

    const openaiAsync = import("https://esm.sh/openai@4.87.4").then(
      (mod) =>
        new mod.OpenAI({
          dangerouslyAllowBrowser: true,
          apiKey,
        })
    );

    const parserAsync = import("https://esm.sh/@streamparser/json").then((mod) => new mod.JSONParser());

    errorElement.style.display = "none";
    loadingElement.style.display = "block";

    try {
      const [issueData, openai] = await Promise.all([fetchIssueData(owner, repo, token), openaiAsync]);
      console.log(openai);

      const serializedGraph = issueData.nodes.map((node) => `[${node.labels.map((label) => label.name).join(", ")}] #${node.id} ${node.title}`).join("\n");

      const [existingIdeas, discardedIdeas] = [getExistingIdeas(), getDiscardedIdeas()];
      const existingIdeasPrompt = `
The user is inspired by the following ideas. Make sure your new ideas are meaningfully different from these:
${existingIdeas.map((idea) => `- ${idea.title} (sources: ${idea.sourceIds.join(", ")})`).join("\n")}
        `.trim();

      const discardedIdeasPrompt = `
The user rejected the following ideas. Avoid similar ideas:
${discardedIdeas.map((idea) => `- ${idea.title} (sources: ${idea.sourceIds.join(", ")})`).join("\n")}
        `.trim();

      const newIdeas = await openai.responses.create({
        model: "gpt-4.1",
        input: `
Generate innovative and inspiring ideas based on the content in the backlog:

\`\`\`backlog
${serializedGraph}
\`\`\`
${existingIdeas ? `\n${existingIdeasPrompt}\n` : ""}
${discardedIdeas ? `\n${discardedIdeasPrompt}\n` : ""}
Respond 7 ideas in this JSON format:
type Response {
  ideas: {
    title: string;
    description: string;
    sourceIds: number[];
  }[]
}
        `,
        text: {
          format: {
            type: "json_object",
          },
        },
        stream: true,
      });

      const mountedParser = parserAsync.then((parser) => {
        parser.onValue = (entry) => {
          if (typeof entry.key === "number" && typeof entry?.value?.title === "string") {
            console.log("Parsed value:", entry.value);
            renderIdeaCard(entry.value.title, entry.value.description, entry.value.sourceIds, owner, repo);
          }
        };

        return parser;
      });

      for await (const chunk of newIdeas) {
        try {
          // await mountedParser.write(chunk
          if (chunk.type === "response.output_text.delta") {
            (await mountedParser).write(chunk.delta);
          }
        } catch (error) {
          console.error("Error parsing chunk:", error);
        }
      }
    } catch (error) {
      errorElement.textContent = `Error: ${error.message}`;
      errorElement.style.display = "block";
      console.error(error);
    } finally {
      loadingElement.style.display = "none";
    }
  });

  // handle discard
  document.getElementById("ideas").addEventListener("click", (event) => {
    if (event.target.matches("[data-discard]")) {
      event.preventDefault();
      const card = event.target.closest(".idea-card");
      card.hidden = true;
    }
  });
}

function renderIdeaCard(title, description, sourceIds, owner, repo) {
  const sourceLinks = sourceIds.map((id) => `<a href="https://github.com/${owner}/${repo}/issues/${id}" target="_blank">#${id}</a>`).join(", ");
  const newIssueUrl = `https://github.com/${owner}/${repo}/issues/new?template=inspiration-template.md&title=${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(description)}`;
  const newIssueLink = `<a href="${newIssueUrl}" target="_blank">Add</a>`;
  const discardLink = `<a data-discard href="#">Discard</a>`;

  const card = document.createElement("div");
  card.className = "idea-card";
  card.innerHTML = `
    <h3>${title}</h3>
    <p>${description}</p>
    <p>${newIssueLink} | ${discardLink} | sources: ${sourceLinks}</p>
  `;
  document.getElementById("ideas").appendChild(card);
}

function getExistingIdeas() {
  const existingIdeas = document.querySelectorAll(".idea-card:not([hidden])");
  return Array.from(existingIdeas).map((card) => ({
    title: card.querySelector("h3").textContent,
    sourceIds: Array.from(card.querySelectorAll("a"))
      .filter((link) => link.textContent.startsWith("#"))
      .map((link) => link.textContent.replace("#", "")),
  }));
}

function getDiscardedIdeas() {
  const discardedIdeas = document.querySelectorAll(".idea-card[hidden]");
  return Array.from(discardedIdeas).map((card) => ({
    title: card.querySelector("h3").textContent,
    sourceIds: Array.from(card.querySelectorAll("a"))
      .filter((link) => link.textContent.startsWith("#"))
      .map((link) => link.textContent.replace("#", "")),
  }));
}
