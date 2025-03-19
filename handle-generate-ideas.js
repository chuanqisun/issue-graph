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
Generate innovative ideas based on the content in the backlog:

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

      for await (const chunk of newIdeas) {
        const parser = await parserAsync;
        console.log(chunk);
      }

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
