(() => {
  function mountStreetMap() {
    const container = document.getElementById("street-map");
    const button = document.getElementById("enable-tiles");
    const status = document.getElementById("street-status");
    if (!container || !button || !status) return;

    const defaultAttribution =
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
    let attribution = document.querySelector("[data-street-attribution]");
    if (!attribution) {
      attribution = document.createElement("p");
      attribution.dataset.streetAttribution = "";
      attribution.className = "street-attribution";
      attribution.innerHTML = defaultAttribution;
      container.after(attribution);
    }
    const attributionText = () =>
      container.dataset.tileAttribution?.trim() || defaultAttribution;
    if (container.dataset.tileAttribution?.trim())
      attribution.innerHTML = attributionText();
    status.setAttribute("role", "status");
    status.textContent =
      "Street tiles are disabled. Enable them to load the configured provider.";
    let map;
    let tiles;
    function loadTiles() {
      const L = window.CodexLeaflet;
      if (!L) {
        status.textContent =
          "The local Leaflet library did not load. Reload the page to try again.";
        button.disabled = false;
        return;
      }
      const template =
        container.dataset.tileUrl ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
      let provider;
      try {
        if (
          !template.includes("{z}") ||
          !template.includes("{x}") ||
          !(template.includes("{y}") || template.includes("{-y}")) ||
          /[{}]/.test(template.replace(/\{(?:z|x|y|-y|s|r)\}/g, ""))
        )
          throw new Error(
            "tile template must contain {z}, {x}, and {y} or {-y}, with only supported Leaflet placeholders",
          );
        const url = new URL(template, location.href);
        if (!["http:", "https:"].includes(url.protocol))
          throw new Error("unsupported tile URL");
        provider =
          url.hostname === "tile.openstreetmap.org"
            ? "OpenStreetMap"
            : ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
              ? "local tile fixture"
              : "configured tile provider";
        if (!map) {
          map = L.map(container, {
            keyboard: true,
            dragging: true,
            scrollWheelZoom: true,
          }).setView([38.7223, -9.1393], 13);
          L.control.scale().addTo(map);
          window.CodexStreetMap = map;
        }
        if (tiles) {
          tiles.off();
          map.removeLayer(tiles);
        }
        let failures = 0;
        let loaded = 0;
        attribution.innerHTML = attributionText();
        tiles = L.tileLayer(template, {
          maxZoom: 19,
          attribution: attributionText(),
        });
        const loading = () => {
          failures = 0;
          loaded = 0;
          status.textContent = `Loading ${provider} tiles…`;
          button.textContent = "Loading street tiles…";
          button.disabled = true;
        };
        tiles.on("loading", loading);
        tiles.on("tileload", () => {
          loaded += 1;
        });
        tiles.on("tileerror", () => {
          failures += 1;
          status.textContent = `${provider} tile loading failed. The map remains interactive; retry to request the tiles again.`;
          button.textContent = "Retry street tiles";
          button.disabled = false;
        });
        tiles.on("load", () => {
          if (failures) return;
          status.textContent = loaded
            ? `${provider} tiles loaded. Pan, zoom, or use the arrow and +/- keys.`
            : `No ${provider} tiles loaded for this view.`;
          button.textContent = "Reload street tiles";
          button.disabled = false;
        });
        loading();
        tiles.addTo(map);
      } catch (error) {
        status.textContent = `Street map could not start: ${error.message}. Check the tile URL and retry.`;
        button.textContent = "Retry street tiles";
        button.disabled = false;
      }
    }
    button.addEventListener("click", loadTiles);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mountStreetMap, {
      once: true,
    });
  else mountStreetMap();
})();
