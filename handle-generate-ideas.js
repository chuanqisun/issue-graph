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
    document.getElementById("ideas").innerHTML = "";

    try {
      const [issueData, openai] = await Promise.all([fetchIssueData(owner, repo, token), openaiAsync]);
      console.log(openai);

      const serializedGraph = issueData.nodes
        .map((node) =>
          `
#${node.id} ${node.title}
type: ${node.labels.map((label) => label.name).join(", ")}
      `.trim()
        )
        .join("\n\n");

      const newIdeas = await openai.responses.create({
        model: "o3-mini",
        input: `
Generate innovative and inspiring ideas based on the content in the backlog:

\`\`\`backlog
${serializedGraph}
\`\`\`

Respond 10 ideas in this JSON format:
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
        reasoning: {
          effort: "low",
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
}

function renderIdeaCard(title, description, sourceIds, owner, repo) {
  const sourceLinks = sourceIds.map((id) => `<a href="https://github.com/${owner}/${repo}/issues/${id}" target="_blank">#${id}</a>`).join(", ");
  const newIssueLink = `<a href="https://github.com/${owner}/${repo}/issues/new?template=inspiration-template.md&title=${encodeURIComponent(
    title
  )}&body=${encodeURIComponent(description)}" target="_blank">Add</a>`;

  const card = document.createElement("div");
  card.className = "idea-card";
  card.innerHTML = `
    <h3>${title}</h3>
    <p>${description}</p>
    <p>${newIssueLink} | sources: ${sourceLinks}</p>
  `;
  document.getElementById("ideas").appendChild(card);
}
