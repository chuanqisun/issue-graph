import { fetchIssueData } from "./fetch-graph-data.js";

export function handleVisualizeGraph() {
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
}
