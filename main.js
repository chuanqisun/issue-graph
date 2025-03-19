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

document.getElementById("visualize").addEventListener("click", async () => {
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
  document.getElementById("visualization").innerHTML = "";

  try {
    const issueData = await fetchIssueData(owner, repo, token);
    visualizeIssueGraph(issueData);
  } catch (error) {
    errorElement.textContent = `Error: ${error.message}`;
    errorElement.style.display = "block";
    console.error(error);
  } finally {
    loadingElement.style.display = "none";
  }
});

async function fetchIssueData(owner, repo, token) {
  // GraphQL query to fetch open issues and their cross-references
  const query = `
                query($owner: String!, $repo: String!, $cursor: String) {
                    repository(owner: $owner, name: $repo) {
                        issues(first: 100, after: $cursor, states: [OPEN], orderBy: {field: CREATED_AT, direction: DESC}) {
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                            nodes {
                                number
                                title
                                url
                                createdAt
                                labels(first: 5) {
                                    nodes {
                                        name
                                        color
                                    }
                                }
                                timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT]) {
                                    nodes {
                                        ... on CrossReferencedEvent {
                                            source {
                                                ... on Issue {
                                                    number
                                                    repository {
                                                        nameWithOwner
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

  const issues = [];
  let hasNextPage = true;
  let cursor = null;

  // Paginate through all issues
  while (hasNextPage) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { owner, repo, cursor },
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    const issuesData = data.data.repository.issues;
    issues.push(...issuesData.nodes);

    hasNextPage = issuesData.pageInfo.hasNextPage;
    cursor = issuesData.pageInfo.endCursor;
  }

  return processIssueData(issues, owner, repo);
}

function processIssueData(issues, owner, repo) {
  const nodes = [];
  const links = [];
  const issueMap = {};
  const fullRepoName = `${owner}/${repo}`;
  const labelTypes = new Set();
  const labelColors = {};

  // Create nodes for each issue
  issues.forEach((issue) => {
    const labels = issue.labels.nodes;
    const issueLabels = labels.map((label) => ({
      name: label.name.toLowerCase(),
      color: `#${label.color}`,
    }));

    // Collect all unique label types and their colors
    issueLabels.forEach((label) => {
      labelTypes.add(label.name);
      labelColors[label.name] = label.color;
    });

    nodes.push({
      id: issue.number,
      title: issue.title,
      url: issue.url,
      labels: issueLabels,
      // Default color if no labels
      color: issueLabels.length > 0 ? issueLabels[0].color : "#6e7781",
    });

    issueMap[issue.number] = true;
  });

  // Create links for cross-references
  issues.forEach((issue) => {
    issue.timelineItems.nodes.forEach((item) => {
      if (item.source && item.source.number && item.source.repository && item.source.repository.nameWithOwner === fullRepoName) {
        const sourceNumber = item.source.number;

        // Only create links between issues in our dataset
        if (issueMap[sourceNumber] && sourceNumber !== issue.number) {
          links.push({
            source: sourceNumber,
            target: issue.number,
          });
        }
      }
    });
  });

  // Create legend data from collected labels
  const legendData = {};
  labelTypes.forEach((type) => {
    legendData[type] = labelColors[type];
  });

  // Add "other" to legend for unlabeled issues
  legendData.unlabeled = "#6e7781";

  return { nodes, links, legendData };
}

function visualizeIssueGraph(data) {
  const width = document.getElementById("visualization").clientWidth;
  const height = 600;

  // Update legend with dynamic colors
  updateLegend(data.legendData);

  // Create SVG
  const svg = d3.select("#visualization").append("svg").attr("width", width).attr("height", height);

  // Create tooltip
  const tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);

  // Create simulation
  const simulation = d3
    .forceSimulation(data.nodes)
    .force(
      "link",
      d3
        .forceLink(data.links)
        .id((d) => d.id)
        .distance(100) // Reduced from 150
    )
    .force("charge", d3.forceManyBody().strength(-200)) // Reduced from -400
    .force("center", d3.forceCenter(width / 2, height / 2).strength(0.1)) // Add strength parameter
    // Add a new force to pull nodes toward center
    .force("x", d3.forceX(width / 2).strength(0.07))
    .force("y", d3.forceY(height / 2).strength(0.07))
    .force("collision", d3.forceCollide().radius(50));

  // Create links
  const link = svg
    .append("g")
    .selectAll("line")
    .data(data.links)
    .enter()
    .append("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", 1.5);

  // Create node groups
  const nodeGroup = svg.append("g").selectAll(".node-group").data(data.nodes).enter().append("g").attr("class", "node-group");

  // Create nodes
  const node = nodeGroup
    .append("circle")
    .attr("class", "node")
    .attr("r", 20) // Larger node size
    .attr("fill", (d) => d.color) // Use the first label's color
    .attr("stroke", "#fff")
    .attr("stroke-width", 2)
    .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended));

  // Add issue numbers inside nodes
  nodeGroup
    .append("text")
    .text((d) => `#${d.id}`)
    .attr("text-anchor", "middle")
    .attr("dy", ".3em")
    .attr("fill", "white")
    .attr("font-size", "12px")
    .attr("pointer-events", "none");

  // Add issue titles next to nodes
  const labels = nodeGroup
    .append("text")
    .attr("class", "node-label")
    .text((d) => d.title)
    .attr("dx", 25)
    .attr("dy", 5)
    .attr("font-size", "14px")
    .attr("opacity", 1);

  // Add label indicators around the node
  nodeGroup.each(function (d) {
    const nodeGroup = d3.select(this);
    const numLabels = d.labels.length;

    if (numLabels > 1) {
      // Create small circles for additional labels
      const labelRadius = 6;
      const radius = 25; // Orbit radius around the main node

      d.labels.slice(1).forEach((label, i) => {
        const angle = (i * 2 * Math.PI) / (numLabels - 1) - Math.PI / 2; // Distribute evenly
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);

        nodeGroup
          .append("circle")
          .attr("class", "label-indicator")
          .attr("cx", x)
          .attr("cy", y)
          .attr("r", labelRadius)
          .attr("fill", label.color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1)
          .append("title")
          .text(label.name);
      });
    }
  });

  // Add hover effect for labels
  node
    .on("mouseover", function (event, d) {
      d3.select(this.parentNode).select(".node-label").transition().duration(200).attr("opacity", 1);

      tooltip.transition().duration(200).style("opacity", 0.9);

      // Format labels for tooltip
      const labelsHtml =
        d.labels.length > 0 ? `<br/>Labels: ${d.labels.map((l) => `<span style="color:${l.color}">${l.name}</span>`).join(", ")}` : "<br/>Labels: none";

      tooltip
        .html(
          `<strong>#${d.id}: ${d.title}</strong>${labelsHtml}<br/>
                <a href="${d.url}" target="_blank">View on GitHub</a>`
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseout", function () {
      d3.select(this.parentNode).select(".node-label").transition().duration(500).attr("opacity", 1);

      tooltip.transition().duration(500).style("opacity", 0);
    })
    .on("click", function (event, d) {
      window.open(d.url, "_blank");
    });

  // Update positions on simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    nodeGroup.attr("transform", (d) => {
      d.x = Math.max(20, Math.min(width - 20, d.x));
      d.y = Math.max(20, Math.min(height - 20, d.y));
      return `translate(${d.x}, ${d.y})`;
    });
  });

  // Drag functions
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
}

// Function to update the legend with the actual colors
function updateLegend(colors) {
  const legend = document.querySelector(".legend");
  legend.innerHTML = "";

  // Add title to the legend
  const title = document.createElement("h3");
  title.className = "legend-title";
  title.textContent = "Label Legend";
  legend.appendChild(title);

  // Create legend grid container
  const legendGrid = document.createElement("div");
  legendGrid.className = "legend-grid";
  legend.appendChild(legendGrid);

  // Sort labels alphabetically
  const sortedLabels = Object.keys(colors).sort();

  sortedLabels.forEach((type) => {
    const color = colors[type];
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";

    const colorDiv = document.createElement("div");
    colorDiv.className = "legend-color";
    colorDiv.style.backgroundColor = color;

    const span = document.createElement("span");
    span.className = "legend-text";
    span.textContent = type.charAt(0).toUpperCase() + type.slice(1);

    legendItem.appendChild(colorDiv);
    legendItem.appendChild(span);
    legendGrid.appendChild(legendItem);
  });
}

// initial form values
const ownerInput = document.getElementById("owner");
const repoInput = document.getElementById("repo");
const tokenInput = document.getElementById("token");

ownerInput.addEventListener("input", () => {
  updateURLParams(ownerInput.value, repoInput.value);
});

repoInput.addEventListener("input", () => {
  updateURLParams(ownerInput.value, repoInput.value);
});

tokenInput.addEventListener("input", () => {
  localStorage.setItem("issue-graph:access-token", tokenInput.value);
});
