(() => {
  const mount = () => {
    const library = window.CodexMaps;
    const svg = document.getElementById("vector-map");
    const select = document.getElementById("country");
    const status = document.getElementById("map-status");
    if (!svg || !select || !status) return;
    if (!library) {
      status.textContent =
        "The local geography bundle did not load. Build it and reload the page.";
      return;
    }
    const { d3, topojson, world } = library;
    const countries = topojson.feature(world, world.objects.countries).features;
    const key = (country) =>
      String(country.id ?? `name:${country.properties.name}`);
    for (const country of [...countries].sort((a, b) =>
      a.properties.name.localeCompare(b.properties.name),
    )) {
      const option = document.createElement("option");
      option.value = key(country);
      option.textContent = country.properties.name;
      select.append(option);
    }
    const root = d3.select(svg);
    root
      .append("rect")
      .attr("width", 720)
      .attr("height", 420)
      .attr("fill", "#e4ece7");
    const globe = root
      .append("path")
      .attr("fill", "#f6f8f1")
      .attr("stroke", "#b9c9bf");
    const marks = root.append("g");
    const heading = root
      .append("text")
      .attr("x", 24)
      .attr("y", 32)
      .attr("fill", "#18362d")
      .attr("font-family", "sans-serif")
      .attr("font-size", 18);
    const credit = root
      .append("text")
      .attr("x", 24)
      .attr("y", 402)
      .attr("fill", "#486057")
      .attr("font-family", "sans-serif")
      .attr("font-size", 11);
    function draw() {
      const selected = countries.find(
        (country) => key(country) === select.value,
      );
      const bounds = selected && d3.geoBounds(selected);
      // Move the clipping meridian away from regions that cross the dateline.
      const meridian =
        bounds && bounds[0][0] > bounds[1][0]
          ? ((bounds[0][0] +
              ((bounds[1][0] - bounds[0][0] + 360) % 360) / 2 +
              180) %
              360) -
            180
          : 0;
      const projection = selected
        ? d3
            .geoMercator()
            .rotate([-meridian, 0])
            .fitExtent(
              [
                [36, 58],
                [684, 374],
              ],
              selected,
            )
        : d3.geoNaturalEarth1().fitExtent(
            [
              [24, 58],
              [696, 378],
            ],
            { type: "Sphere" },
          );
      const path = d3.geoPath(projection);
      const name = selected?.properties.name ?? "World";
      globe.attr("d", selected ? null : path({ type: "Sphere" }));
      marks
        .selectAll("path")
        .data(selected ? [selected] : countries, key)
        .join("path")
        .attr("data-country", key)
        .attr("d", path)
        .attr("fill", (country) =>
          selected && key(country) === key(selected) ? "#307457" : "#cfdbca",
        )
        .attr("stroke", "#597262")
        .attr("stroke-width", 0.6)
        .attr("stroke-linejoin", "round")
        .style("cursor", "pointer")
        .on("click", (_event, country) => {
          select.value = key(country);
          draw();
        })
        .selectAll("title")
        .data((country) => [country])
        .join("title")
        .text((country) => country.properties.name);
      heading.text(name);
      credit.text(
        `Natural Earth 1:110m · ${selected ? "Mercator" : "Natural Earth 1"} · world-atlas 2.0.2`,
      );
      svg.querySelector("#map-title").textContent = `${name} country map`;
      svg.querySelector("#map-description").textContent =
        `${name}, ${selected ? "Mercator" : "Natural Earth 1"} projection. Coarse Natural Earth country geometry.`;
      status.textContent = selected
        ? `${name} · fitted Mercator projection`
        : `${countries.length} countries · Natural Earth 1 projection`;
      window.CodexVectorMap = { countries, projection, selected, svg };
    }
    select.addEventListener("change", draw);
    document.getElementById("world-view").addEventListener("click", () => {
      select.value = "";
      draw();
    });
    const download = (blob, extension) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const name = window.CodexVectorMap.selected?.properties.name ?? "world";
      link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-map.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const serialized = () => {
      const clone = svg.cloneNode(true);
      clone.setAttribute("width", "720");
      clone.setAttribute("height", "420");
      return new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml",
      });
    };
    document
      .getElementById("save-svg")
      .addEventListener("click", () => download(serialized(), "svg"));
    document.getElementById("save-png").addEventListener("click", async () => {
      const url = URL.createObjectURL(serialized());
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1440;
        canvas.height = 840;
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("PNG encoding failed");
        download(blob, "png");
      } catch (error) {
        status.textContent = `Map export failed: ${error.message}`;
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    draw();
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
