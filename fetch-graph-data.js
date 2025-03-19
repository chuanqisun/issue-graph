/**
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns
 */
export async function fetchIssueData(owner, repo, token) {
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
