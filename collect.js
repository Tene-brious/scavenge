(() => {
  "use strict";

  /*
    Readable English rewrite of the obfuscated Tribal Wars scavenging helper.
    Purpose:
    - Add per-village controls to the scavenging overview
    - Let the player choose which scavenging options to use
    - Let the player choose troop types / percentages / optional hard limits
    - Calculate projected rewards before sending
    - Optionally send scavenges in bulk

    Notes:
    - This is a faithful functional rewrite, not a byte-for-byte deobfuscation.
    - All Russian UI strings and logs have been translated to English.
  */

  const OPTION_WEIGHTS = {
    1: 15,
    2: 6,
    3: 3,
    4: 2,
  };

  const OPTION_TITLES = {
    1: "Lazy Looters",
    2: "Humble Haul",
    3: "Clever Collectors",
    4: "Great Gatherers",
  };

  const MIN_TROOPS_TO_KEEP = 10;
  const OPTION_PREVIEW_DELAY_MS = 1500;
  const CLEAR_FORM_DELAY_MS = 500;
  const SEND_DELAY_MS = 1000;
  const SCRIPT_VERSION = "fallback";

  let troopTypes = [];
  let troopIndexInOverview = {};
  let worldHasArchers = false;
  let fineTuningEnabled = false;
  let runMode = "unknown";

  function detectWorldAndTroops() {
    const archerInput = document.querySelector('input[name="archer"]');
    const mountedArcherInput = document.querySelector('input[name="marcher"]');

    if (archerInput && mountedArcherInput) {
      worldHasArchers = true;
      console.log("World detected: WITH ARCHERS");

      troopTypes = [
        { key: "spear", name: "Spearman", icon: "🗡️", carry: 25, overviewIndex: 0 },
        { key: "sword", name: "Swordsman", icon: "⚔️", carry: 15, overviewIndex: 1 },
        { key: "axe", name: "Axeman", icon: "🪓", carry: 10, overviewIndex: 2 },
        { key: "archer", name: "Archer", icon: "🏹", carry: 10, overviewIndex: 3 },
        { key: "light", name: "Light Cavalry", icon: "🐎", carry: 80, overviewIndex: 5 },
        { key: "marcher", name: "Mounted Archer", icon: "🏇", carry: 50, overviewIndex: 6 },
        { key: "heavy", name: "Heavy Cavalry", icon: "🛡️", carry: 50, overviewIndex: 7 },
        { key: "knight", name: "Paladin", icon: "⚜️", carry: 100, overviewIndex: 10 },
      ];
    } else {
      worldHasArchers = false;
      console.log("World detected: WITHOUT ARCHERS (classic)");

      troopTypes = [
        { key: "spear", name: "Spearman", icon: "🗡️", carry: 25, overviewIndex: 0 },
        { key: "sword", name: "Swordsman", icon: "⚔️", carry: 15, overviewIndex: 1 },
        { key: "axe", name: "Axeman", icon: "🪓", carry: 10, overviewIndex: 2 },
        { key: "light", name: "Light Cavalry", icon: "🐎", carry: 80, overviewIndex: 4 },
        { key: "heavy", name: "Heavy Cavalry", icon: "🛡️", carry: 50, overviewIndex: 5 },
        { key: "knight", name: "Paladin", icon: "⚜️", carry: 100, overviewIndex: 6 },
      ];
    }

    troopIndexInOverview = {};
    for (const troop of troopTypes) {
      troopIndexInOverview[troop.key] = troop.overviewIndex;
    }

    console.log(
      "Troop types for scavenging:",
      troopTypes.map((troop) => troop.key).join(", ")
    );
  }

  function getWorldCode() {
    const match = window.location.hostname.match(/([a-z]+[0-9]+)\./);
    return match ? match[1] : "unknown";
  }

  function getCurrentVillageId() {
    const topDisplay = document.getElementById("topdisplay");
    if (topDisplay) {
      const villageLink = topDisplay.querySelector(".bg a");
      if (villageLink?.href) {
        const match = villageLink.href.match(/village=(\d+)/);
        if (match) return match[1];
      }
    }

    const fallbackMatch = window.location.href.match(/village=(\d+)/);
    return fallbackMatch ? fallbackMatch[1] : null;
  }

  function storageKey(prefix, ...parts) {
    return `${prefix}${getWorldCode()}_${parts.join("_")}`;
  }

  function setFineTuningEnabled(value) {
    localStorage.setItem(`scavenge_fine_tuning_${getWorldCode()}`, value ? "true" : "false");
  }

  function getFineTuningEnabled() {
    return localStorage.getItem(`scavenge_fine_tuning_${getWorldCode()}`) === "true";
  }

  function setTroopLimit(villageId, troopKey, value) {
    localStorage.setItem(storageKey("scavenge_limit_", villageId, troopKey), value);
  }

  function getTroopLimit(villageId, troopKey) {
    const value = localStorage.getItem(storageKey("scavenge_limit_", villageId, troopKey));
    return value !== null ? value : "";
  }

  function setTroopEnabled(villageId, troopKey, enabled) {
    localStorage.setItem(storageKey("scavenge_troop_", villageId, troopKey), enabled ? "true" : "false");
  }

  function getTroopEnabled(villageId, troopKey) {
    const value = localStorage.getItem(storageKey("scavenge_troop_", villageId, troopKey));
    return value !== null ? value === "true" : true;
  }

  function setVillagePercent(villageId, percent) {
    localStorage.setItem(`scavenge_percent_${getWorldCode()}_${villageId}`, percent);
  }

  function getVillagePercent(villageId) {
    const value = localStorage.getItem(`scavenge_percent_${getWorldCode()}_${villageId}`);
    return value !== null ? parseInt(value, 10) : 100;
  }

  function setSelectedModes(villageId, modes) {
    localStorage.setItem(
      `scavenge_modes_${getWorldCode()}_${villageId}`,
      JSON.stringify(modes)
    );
  }

  function getSelectedModes(villageId) {
    const raw = localStorage.getItem(`scavenge_modes_${getWorldCode()}_${villageId}`);
    if (!raw) return [1, 2, 3, 4];

    try {
      return JSON.parse(raw);
    } catch {
      return [1, 2, 3, 4];
    }
  }

  function setDistributionMode(mode) {
    const normalized = mode === "weighted" ? "weighted" : "even";
    localStorage.setItem(`scavenge_distribution_${getWorldCode()}`, normalized);
  }

  function getDistributionMode() {
    const value = localStorage.getItem(`scavenge_distribution_${getWorldCode()}`);
    return value === "weighted" ? "weighted" : "even";
  }

  function parseLimitValue(limitText, availableCount) {
    if (!limitText || limitText.trim() === "") return null;

    const trimmed = limitText.trim();
    if (trimmed.endsWith("%")) {
      const percent = parseFloat(trimmed.slice(0, -1));
      if (!Number.isNaN(percent)) {
        return Math.floor((availableCount * percent) / 100);
      }
      return null;
    }

    const numeric = parseInt(trimmed, 10);
    return Number.isNaN(numeric) ? null : numeric;
  }

  function applyTroopLimits(baseTroopsToSend, configuredLimits, originalCounts) {
    const limited = { ...baseTroopsToSend };

    for (const troopKey in limited) {
      const configuredValue = configuredLimits[troopKey];
      if (configuredValue && configuredValue.trim() !== "") {
        const maxAllowed = parseLimitValue(configuredValue, originalCounts[troopKey]);
        if (maxAllowed !== null && limited[troopKey] > maxAllowed) {
          limited[troopKey] = maxAllowed;
        }
      }
    }

    return limited;
  }

  async function fetchVillageTroopsFromOverview() {
    const origin = window.location.origin;
    const villageId = getCurrentVillageId();
    const sitterMatch = window.location.href.match(/[?&]t=(\d+)/);
    const sitterToken = sitterMatch ? sitterMatch[1] : "";

    if (!villageId) {
      console.error("Could not determine current village ID");
      return null;
    }

    try {
      const url =
        `${origin}/game.php?village=${villageId}` +
        `&screen=overview_villages&mode=units&type=own_home` +
        (sitterToken ? `&t=${sitterToken}` : "");

      console.log("Loading troop data:", url);

      const response = await fetch(url, { credentials: "include" });
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const unitsTable = doc.querySelector("#units_table");

      if (!unitsTable) {
        console.error("Troop table not found");
        return null;
      }

      const villageData = {};
      const rows = unitsTable.querySelectorAll("tbody tr");

      rows.forEach((row) => {
        const marker = row.querySelector("tbody.row_marker");
        const dataId = marker ? marker.getAttribute("data-id") : null;
        const villageLink = row.querySelector("td:first-child a");

        let fallbackVillageId = null;
        if (villageLink) {
          const match = villageLink.href.match(/village=(\d+)/);
          fallbackVillageId = match ? match[1] : null;
        }

        const resolvedVillageId = dataId || fallbackVillageId;
        if (!resolvedVillageId) return;

        const unitCells = row.querySelectorAll("td.unit-item");
        villageData[resolvedVillageId] = {};

        for (const troop of troopTypes) {
          const overviewIndex = troopIndexInOverview[troop.key];
          let count = 0;

          if (unitCells[overviewIndex]) {
            const cell = unitCells[overviewIndex];
            if (!cell.classList.contains("hidden")) {
              count = parseInt(cell.textContent, 10) || 0;
            }
          }

          villageData[resolvedVillageId][troop.key] = count;
        }
      });

      console.log(`Received troop data for ${Object.keys(villageData).length} villages`);
      console.log("World type:", worldHasArchers ? "with archers" : "classic");
      console.log("Sample troop data:", villageData[Object.keys(villageData)[0]]);

      return villageData;
    } catch (error) {
      console.error("Error fetching troops:", error);
      return null;
    }
  }

  function setUnitInputValue(troopKey, value) {
    const input = document.querySelector(`input[name="${troopKey}"]`);
    if (!input) return;

    input.value = Math.floor(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearScavengeInputs() {
    for (const troop of troopTypes) {
      const input = document.querySelector(`input[name="${troop.key}"]`);
      if (!input) continue;

      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function parseDurationToSeconds(durationText) {
    const parts = durationText.split(":");
    if (parts.length !== 3) return 0;

    return (
      parseInt(parts[0], 10) * 3600 +
      parseInt(parts[1], 10) * 60 +
      parseInt(parts[2], 10)
    );
  }

  function removeTinyCounts(counts) {
    const cleaned = { ...counts };
    for (const troopKey in cleaned) {
      if (cleaned[troopKey] < MIN_TROOPS_TO_KEEP) {
        cleaned[troopKey] = 0;
      }
    }
    return cleaned;
  }

  function isMassScavengePage() {
    return Boolean(document.querySelector(".mass-scavenge-table"));
  }

  function isSingleScavengePage() {
    return Boolean(
      document.querySelector(".scavenge-option") &&
      document.querySelector('input[name="spear"]')
    );
  }

  function getAvailableOptionIdsSinglePage(selectedModes) {
    const available = [];
    for (const optionId of selectedModes) {
      const optionCell = document.querySelector(`.scavenge-option:nth-child(${optionId})`);
      if (!optionCell) continue;

      const blocked =
        optionCell.classList.contains("option-unavailable") ||
        optionCell.classList.contains("option-locked");

      if (!blocked) {
        available.push(optionId);
      }
    }
    return available;
  }

  function getOptionFractions(optionIds) {
    if (!optionIds || optionIds.length === 0) return [];

    const distributionMode = getDistributionMode();
    if (distributionMode === "weighted") {
      let totalWeight = 0;
      for (const optionId of optionIds) {
        totalWeight += OPTION_WEIGHTS[optionId];
      }

      return optionIds.map((optionId) => ({
        optionId,
        fraction: OPTION_WEIGHTS[optionId] / totalWeight,
      }));
    }

    const evenFraction = 1 / optionIds.length;
    return optionIds.map((optionId) => ({
      optionId,
      fraction: evenFraction,
    }));
  }

  function getSingleVillageRuntimeConfig(villageId) {
    const selectedModes = getSelectedModes(villageId);
    const percentToUse = getVillagePercent(villageId);
    const troopEnabled = {};
    const troopLimits = {};

    for (const troop of troopTypes) {
      troopEnabled[troop.key] = getTroopEnabled(villageId, troop.key);
      troopLimits[troop.key] = getTroopLimit(villageId, troop.key);
    }

    const distributionMode = getDistributionMode();
    return { selectedModes, percentToUse, troopEnabled, troopLimits, distributionMode };
  }

  function buildSingleVillageControlPanel(villageId, availableCounts) {
    document.getElementById("single-scavenge-panel")?.remove();
    const launcher = document.getElementById("single-scavenge-launcher");
    if (launcher) launcher.style.display = "none";

    const panel = document.createElement("div");
    panel.id = "single-scavenge-panel";
    panel.style.cssText =
      "position: fixed; top: 72px; right: 12px; width: 320px; max-height: 86vh; overflow-y: auto; z-index: 10001; background: #f8f3e5; border: 2px solid rgb(210,180,100); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); font-family: Arial,sans-serif; color: #2c3e50;";

    const config = getSingleVillageRuntimeConfig(villageId);

    const optionsHtml = [1, 2, 3, 4]
      .map((id) => {
        const checked = config.selectedModes.includes(id) ? "checked" : "";
        return `
          <label style="display:inline-flex;align-items:center;gap:6px;margin-right:10px;cursor:pointer;">
            <input type="checkbox" class="single-mode-checkbox" data-mode-id="${id}" ${checked}>
            <span>${id}</span>
          </label>
        `;
      })
      .join("");

    const troopRowsHtml = troopTypes
      .map((troop) => {
        const checked = config.troopEnabled[troop.key] ? "checked" : "";
        const limit = config.troopLimits[troop.key] || "";
        const count = availableCounts[troop.key] || 0;
        return `
          <div style="display:grid;grid-template-columns: 1fr auto;gap:6px;align-items:center;padding:2px 0;">
            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" class="single-troop-enabled" data-troop-key="${troop.key}" ${checked}>
              <span>${troop.icon} ${troop.name} (${count.toLocaleString()})</span>
            </label>
            <input
              type="text"
              class="single-troop-limit"
              data-troop-key="${troop.key}"
              value="${limit}"
              placeholder="limit"
              title="Maximum number or %, e.g. 1000 or 50%"
              style="width:72px;padding:2px 4px;font-size:11px;"
            />
          </div>
        `;
      })
      .join("");

    panel.innerHTML = `
      <div style="padding:10px 12px;background:rgb(210,180,100);border-radius:8px 8px 0 0;font-weight:bold;">
        Non-Premium Scavenge Helper
      </div>
      <div style="padding:10px 12px;font-size:12px;">
        <div style="margin-bottom:8px;">
          <strong>Mode:</strong> single village (safer / semi-manual)
        </div>
        <div style="margin-bottom:8px;">
          <strong>Village:</strong> ${villageId}
        </div>
        <div style="margin-bottom:8px;">
          <strong>Options</strong><br>${optionsHtml}
        </div>
        <div style="margin-bottom:8px;">
          <strong>Send %</strong>
          <select id="single-percent-select" style="margin-left:8px;">
            ${Array.from({ length: 11 }, (_, i) => i * 10)
              .map((v) => `<option value="${v}" ${v === config.percentToUse ? "selected" : ""}>${v}%</option>`)
              .join("")}
          </select>
        </div>
        <div style="margin-bottom:8px;">
          <strong>Distribution</strong>
          <select id="single-distribution-select" style="margin-left:8px;">
            <option value="even" ${config.distributionMode === "even" ? "selected" : ""}>Even (recommended)</option>
            <option value="weighted" ${config.distributionMode === "weighted" ? "selected" : ""}>Weighted (15/6/3/2)</option>
          </select>
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="single-fine-tuning" ${fineTuningEnabled ? "checked" : ""}>
            <span>Use troop limits (fine tuning)</span>
          </label>
        </div>
        <div style="margin-bottom:8px;">
          <strong>Troops</strong>
          <div style="margin-top:4px;">${troopRowsHtml}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
          <button id="single-calc-btn" style="padding:6px 8px;cursor:pointer;">Calculate</button>
          <button id="single-send-btn" style="padding:6px 8px;cursor:pointer;">Send (confirm each)</button>
          <button id="single-hide-btn" style="padding:6px 8px;cursor:pointer;">Hide panel</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelectorAll(".single-mode-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const selected = Array.from(panel.querySelectorAll(".single-mode-checkbox"))
          .filter((cb) => cb.checked)
          .map((cb) => parseInt(cb.getAttribute("data-mode-id"), 10));
        setSelectedModes(villageId, selected);
      });
    });

    panel.querySelector("#single-percent-select")?.addEventListener("change", (event) => {
      setVillagePercent(villageId, parseInt(event.target.value, 10));
    });

    panel.querySelector("#single-distribution-select")?.addEventListener("change", (event) => {
      setDistributionMode(event.target.value);
      console.log(
        event.target.value === "weighted"
          ? "Distribution mode: weighted (15/6/3/2)"
          : "Distribution mode: even"
      );
    });

    panel.querySelector("#single-fine-tuning")?.addEventListener("change", (event) => {
      fineTuningEnabled = event.target.checked;
      setFineTuningEnabled(fineTuningEnabled);
      console.log(fineTuningEnabled ? "Fine tuning enabled" : "Fine tuning disabled");
    });

    panel.querySelectorAll(".single-troop-enabled").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const troopKey = event.target.getAttribute("data-troop-key");
        setTroopEnabled(villageId, troopKey, event.target.checked);
      });
    });

    panel.querySelectorAll(".single-troop-limit").forEach((input) => {
      input.addEventListener("change", (event) => {
        const troopKey = event.target.getAttribute("data-troop-key");
        setTroopLimit(villageId, troopKey, event.target.value);
      });
    });

    panel.querySelector("#single-hide-btn")?.addEventListener("click", () => {
      panel.remove();
      const launchBtn = document.getElementById("single-scavenge-launcher");
      if (launchBtn) launchBtn.style.display = "block";
    });

    panel.querySelector("#single-calc-btn")?.addEventListener("click", async () => {
      await calculateSingleVillagePlan();
    });

    panel.querySelector("#single-send-btn")?.addEventListener("click", async () => {
      await sendSingleVillageSemiManual();
    });
  }

  function ensureSinglePanelLauncher(villageId) {
    let button = document.getElementById("single-scavenge-launcher");
    if (!button) {
      button = document.createElement("button");
      button.id = "single-scavenge-launcher";
      button.textContent = "Show Scavenge Panel";
      button.style.cssText =
        "position: fixed; top: 72px; right: 12px; z-index: 10002; padding: 6px 8px; border: 1px solid #7a5f2a; background: rgb(210,180,100); color: #2c3e50; border-radius: 6px; cursor: pointer;";
      document.body.appendChild(button);
    }

    button.style.display = "none";
    button.onclick = async () => {
      const counts = await getCurrentVillageTroopCounts();
      if (!counts) {
        alert("Could not refresh troop counts for current village.");
        return;
      }
      buildSingleVillageControlPanel(villageId, counts);
    };
  }

  async function getCurrentVillageTroopCounts() {
    const villageId = getCurrentVillageId();
    if (!villageId) return null;

    const troopDataByVillage = await fetchVillageTroopsFromOverview();
    if (troopDataByVillage && troopDataByVillage[villageId]) {
      return troopDataByVillage[villageId];
    }

    // Fallback for servers/layouts where overview parsing differs.
    console.warn("Falling back to troop counts from current Collect page");
    return getCurrentVillageTroopCountsFromCollectPage();
  }

  function parseLocalizedInteger(text) {
    if (!text) return 0;
    const digitsOnly = text.replace(/[^\d]/g, "");
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
  }

  function getCurrentVillageTroopCountsFromCollectPage() {
    const result = {};

    for (const troop of troopTypes) {
      const input = document.querySelector(`input[name="${troop.key}"]`);
      let count = 0;

      if (input) {
        // 1) Most reliable if present: HTML max attribute.
        if (input.hasAttribute("max")) {
          count = parseLocalizedInteger(input.getAttribute("max"));
        }

        // 2) Common layout: count appears in the same cell as "(1234)".
        if (!count) {
          const container = input.closest("td, th, div");
          if (container) {
            const match = container.textContent.match(/\(([\d.\s,]+)\)/);
            if (match) count = parseLocalizedInteger(match[1]);
          }
        }

        // 3) Last resort: nearby text around the input.
        if (!count) {
          const parentText = input.parentElement?.textContent || "";
          const match = parentText.match(/\(([\d.\s,]+)\)/);
          if (match) count = parseLocalizedInteger(match[1]);
        }
      }

      result[troop.key] = count;
    }

    console.log("Troop counts read from current page:", result);
    return result;
  }

  async function calculateSingleVillagePlan() {
    const villageId = getCurrentVillageId();
    if (!villageId) {
      console.error("Could not determine current village ID");
      return null;
    }

    const availableCounts = await getCurrentVillageTroopCounts();
    if (!availableCounts) {
      console.error("Could not load current village troop counts");
      return null;
    }

    const config = getSingleVillageRuntimeConfig(villageId);

    const enabledCounts = {};
    for (const troop of troopTypes) {
      enabledCounts[troop.key] = config.troopEnabled[troop.key] ? availableCounts[troop.key] : 0;
    }

    let troopsToSend = {};
    for (const troop of troopTypes) {
      troopsToSend[troop.key] = fineTuningEnabled
        ? enabledCounts[troop.key]
        : Math.floor((enabledCounts[troop.key] * config.percentToUse) / 100);
    }

    if (fineTuningEnabled) {
      troopsToSend = applyTroopLimits(troopsToSend, config.troopLimits, availableCounts);
    }

    if (!Object.values(troopsToSend).some((value) => value > 0)) {
      console.log("SKIP: no troops to send after filters/limits");
      return [];
    }

    const availableModes = getAvailableOptionIdsSinglePage(config.selectedModes);
    if (availableModes.length === 0) {
      console.log("SKIP: no available scavenging options selected");
      return [];
    }

    const optionFractions = getOptionFractions(availableModes);

    const results = [];
    for (const { optionId, fraction } of optionFractions) {
      const title = OPTION_TITLES[optionId];
      const modeTroops = {};

      for (const troop of troopTypes) {
        modeTroops[troop.key] = Math.floor(troopsToSend[troop.key] * fraction);
      }

      const cleanedTroops = removeTinyCounts(modeTroops);
      if (!Object.values(cleanedTroops).some((value) => value > 0)) continue;

      for (const troop of troopTypes) {
        setUnitInputValue(troop.key, cleanedTroops[troop.key]);
      }

      await new Promise((resolve) => setTimeout(resolve, OPTION_PREVIEW_DELAY_MS));

      const optionCard = document.querySelector(`.scavenge-option:nth-child(${optionId})`);
      const wood = parseInt(
        optionCard?.querySelector(".wood-value")?.textContent.replace(/[^0-9]/g, ""),
        10
      ) || 0;
      const stone = parseInt(
        optionCard?.querySelector(".stone-value")?.textContent.replace(/[^0-9]/g, ""),
        10
      ) || 0;
      const iron = parseInt(
        optionCard?.querySelector(".iron-value")?.textContent.replace(/[^0-9]/g, ""),
        10
      ) || 0;
      const duration = optionCard?.querySelector(".duration")?.textContent || "0:00:00";

      results.push({
        optionId,
        title,
        fraction,
        troopsToSend: { ...cleanedTroops },
        resources: { wood, stone, iron, total: wood + stone + iron },
        duration,
      });

      clearScavengeInputs();
      await new Promise((resolve) => setTimeout(resolve, CLEAR_FORM_DELAY_MS));
    }

    showResultsModal([
      {
        villageName: `Village ${villageId}`,
        villageId,
        percent: fineTuningEnabled ? "limits" : config.percentToUse,
        fineTuningEnabled,
        selectedModes: config.selectedModes,
        totalToSend: troopsToSend,
        results,
      },
    ]);

    return results;
  }

  function findSinglePageSendButton(optionId) {
    const optionCard = document.querySelector(`.scavenge-option:nth-child(${optionId})`);
    if (!optionCard) return null;

    const candidateButtons = optionCard.querySelectorAll("a, button, input[type='submit']");
    for (const button of candidateButtons) {
      const text = (button.textContent || button.value || "").trim().toLowerCase();
      if (text.includes("start") || text.includes("começar") || text.includes("collect")) {
        return button;
      }
    }
    return null;
  }

  async function sendSingleVillageSemiManual() {
    const villageId = getCurrentVillageId();
    if (!villageId) {
      console.error("Could not determine current village ID");
      return 0;
    }

    const availableCounts = await getCurrentVillageTroopCounts();
    if (!availableCounts) {
      console.error("Could not load current village troop counts");
      return 0;
    }

    const config = getSingleVillageRuntimeConfig(villageId);
    const selectedModes = getAvailableOptionIdsSinglePage(config.selectedModes);
    if (selectedModes.length === 0) {
      alert("No available options selected.");
      return 0;
    }

    const enabledCounts = {};
    for (const troop of troopTypes) {
      enabledCounts[troop.key] = config.troopEnabled[troop.key] ? availableCounts[troop.key] : 0;
    }

    let troopsToSend = {};
    for (const troop of troopTypes) {
      troopsToSend[troop.key] = fineTuningEnabled
        ? enabledCounts[troop.key]
        : Math.floor((enabledCounts[troop.key] * config.percentToUse) / 100);
    }

    if (fineTuningEnabled) {
      troopsToSend = applyTroopLimits(troopsToSend, config.troopLimits, availableCounts);
    }

    const optionFractions = getOptionFractions(selectedModes);

    let sentCount = 0;
    for (const { optionId, fraction } of optionFractions) {
      const optionTroops = {};

      for (const troop of troopTypes) {
        optionTroops[troop.key] = Math.floor(troopsToSend[troop.key] * fraction);
      }

      const cleanedTroops = removeTinyCounts(optionTroops);
      if (!Object.values(cleanedTroops).some((value) => value > 0)) continue;

      for (const troop of troopTypes) {
        setUnitInputValue(troop.key, cleanedTroops[troop.key]);
      }

      await new Promise((resolve) => setTimeout(resolve, OPTION_PREVIEW_DELAY_MS));

      const proceed = window.confirm(
        `Option ${optionId} (${OPTION_TITLES[optionId]}) is prepared.\n\nClick OK to send this one option now, or Cancel to skip it.`
      );

      if (proceed) {
        const sendButton = findSinglePageSendButton(optionId);
        if (sendButton) {
          sendButton.click();
          sentCount += 1;
          await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
        }
      }

      clearScavengeInputs();
      await new Promise((resolve) => setTimeout(resolve, CLEAR_FORM_DELAY_MS));
    }

    alert(`Finished. Options sent: ${sentCount}`);
    return sentCount;
  }

  async function initSingleVillageMode() {
    const villageId = getCurrentVillageId();
    if (!villageId) {
      console.error("Could not determine current village ID");
      return;
    }

    const availableCounts = await getCurrentVillageTroopCounts();
    if (!availableCounts) {
      console.error("Could not load current village troop counts");
      return;
    }

    ensureSinglePanelLauncher(villageId);
    buildSingleVillageControlPanel(villageId, availableCounts);

    console.log("Non-Premium mode is ready (single village, semi-manual send).");
  }

  function isOptionAvailableForVillage(villageId, optionId, selectedModes) {
    if (!selectedModes.includes(optionId)) return false;

    const optionCell = document.querySelector(
      `[data-village-id="${villageId}"] td.option-${optionId}`
    );

    if (!optionCell) return false;

    const isActive = optionCell.classList.contains("option-active");
    const isUnavailable = optionCell.classList.contains("option-unavailable");
    const isLocked = optionCell.classList.contains("option-locked");

    return isActive && !isUnavailable && !isLocked;
  }

  function selectOnlyThisMode(villageId, optionId) {
    for (let mode = 1; mode <= 4; mode += 1) {
      const checkbox = document.querySelector(
        `[data-village-id="${villageId}"] .mode-${mode} input[type="checkbox"]`
      );
      if (checkbox?.checked) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    const targetCheckbox = document.querySelector(
      `[data-village-id="${villageId}"] .mode-${optionId} input[type="checkbox"]`
    );

    if (targetCheckbox && !targetCheckbox.disabled && !targetCheckbox.hasAttribute("disabled")) {
      targetCheckbox.checked = true;
      targetCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }

  function enableAllControls() {
    document.querySelectorAll(".troop-checkbox, .mode-checkbox").forEach((checkbox) => {
      checkbox.disabled = false;
    });

    document.querySelectorAll(".troops-percent-select").forEach((select) => {
      select.disabled = false;
    });
  }

  function getVillageLimitConfig(villageId) {
    const result = {};
    for (const troop of troopTypes) {
      result[troop.key] = getTroopLimit(villageId, troop.key);
    }
    return result;
  }

  function getCheckedModesForVillage(villageId) {
    const selected = [];

    for (let mode = 1; mode <= 4; mode += 1) {
      const checkbox = document.querySelector(
        `.mode-${mode}[data-village-id="${villageId}"]`
      );
      if (checkbox?.checked) {
        selected.push(mode);
      }
    }

    return selected.length > 0 ? selected : [1, 2, 3, 4];
  }

  async function addColumnsToScavengeTable() {
    console.log("Adding columns...");

    const troopDataByVillage = await fetchVillageTroopsFromOverview();
    if (!troopDataByVillage) {
      console.error("Failed to load troop data");
      return false;
    }

    const table = document.querySelector(".mass-scavenge-table");
    if (!table) return false;

    const thead = table.querySelector("thead");
    const headerRow = thead?.querySelector("tr");
    if (!headerRow) return false;

    if (!headerRow.querySelector(".modes-header")) {
      const firstHeader = headerRow.querySelector("th:first-child");

      const modesHeader = document.createElement("th");
      modesHeader.className = "modes-header";
      modesHeader.style.cssText = "text-align: center; width: 180px; padding: 4px;";

      const modesHeaderInner = document.createElement("div");
      modesHeaderInner.style.cssText =
        "display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;";

      for (let mode = 1; mode <= 4; mode += 1) {
        const icon = document.createElement("img");
        icon.src = `https://dsru.innogamescdn.com/asset/8e371e58/graphic//scavenging/options/${mode}.png`;
        icon.style.width = "20px";
        icon.style.height = "20px";
        icon.title = OPTION_TITLES[mode];
        modesHeaderInner.appendChild(icon);
      }

      modesHeader.appendChild(modesHeaderInner);
      firstHeader.insertAdjacentElement("afterend", modesHeader);

      const percentHeader = document.createElement("th");
      percentHeader.className = "percent-header";
      percentHeader.textContent = "%";
      percentHeader.title = "Percent of troops to send";
      percentHeader.style.cssText = "text-align: center; width: 50px; padding: 4px;";
      modesHeader.insertAdjacentElement("afterend", percentHeader);

      let previousHeader = percentHeader;
      for (const troop of troopTypes) {
        const header = document.createElement("th");
        header.className = "troops-header";
        header.style.cssText = "text-align: center; width: 100px; padding: 4px;";
        header.title = troop.name;

        const icon = document.createElement("img");
        icon.src = `https://dsru.innogamescdn.com/asset/8e371e58/graphic/unit/unit_${troop.key}.png`;
        icon.style.width = "20px";
        icon.style.height = "20px";
        icon.style.verticalAlign = "middle";

        header.appendChild(icon);
        previousHeader.insertAdjacentElement("afterend", header);
        previousHeader = header;
      }
    }

    const villageRows = table.querySelectorAll('tbody tr[id^="scavenge_village_"]');
    console.log(`Villages found: ${villageRows.length}`);

    function updateHeaderTotals() {
      const selectAllRow = Array.from(table.querySelectorAll("tbody tr")).find(
        (row) => row.querySelector("strong")?.textContent === "Select all"
      );

      if (!selectAllRow) return;

      const totals = {};
      for (const troop of troopTypes) {
        totals[troop.key] = 0;
      }

      villageRows.forEach((row) => {
        const villageId = row.getAttribute("data-id");
        const troopCounts = troopDataByVillage[villageId];
        if (!troopCounts) return;

        for (const troop of troopTypes) {
          const checkbox = row.querySelector(`.troop-${troop.key}`);
          const enabled = checkbox ? checkbox.checked : true;
          if (enabled) {
            totals[troop.key] += troopCounts[troop.key] || 0;
          }
        }
      });

      const totalCells = selectAllRow.querySelectorAll(".troops-cell");
      for (let i = 0; i < troopTypes.length; i += 1) {
        if (!totalCells[i]) continue;

        const total = totals[troopTypes[i].key];
        const countSpan = totalCells[i].querySelector(".troop-count");

        if (countSpan) {
          countSpan.textContent = total.toLocaleString();
        } else {
          totalCells[i].textContent = total.toLocaleString();
        }

        totalCells[i].title = `Total ${total.toLocaleString()} ${troopTypes[i].name}`;
        totalCells[i].style.fontWeight = "bold";
      }
    }

    function updateFineTuningVisibility() {
      const percentCells = document.querySelectorAll(".percent-cell");
      const fineTuningContainers = document.querySelectorAll(".fine-tuning-container");
      const percentHeader = document.querySelector(".percent-header");

      if (fineTuningEnabled) {
        percentCells.forEach((cell) => {
          cell.style.display = "none";
        });
        fineTuningContainers.forEach((container) => {
          container.style.display = "block";
        });
        if (percentHeader) percentHeader.style.display = "none";
      } else {
        percentCells.forEach((cell) => {
          cell.style.display = "table-cell";
        });
        fineTuningContainers.forEach((container) => {
          container.style.display = "none";
        });
        if (percentHeader) percentHeader.style.display = "table-cell";
      }
    }

    villageRows.forEach((row) => {
      const villageId = row.getAttribute("data-id");
      const troopCounts = troopDataByVillage[villageId];
      if (!troopCounts) return;

      const firstCell = row.querySelector("td:first-child");
      row.querySelectorAll(".modes-cell, .percent-cell, .troops-cell").forEach((cell) => cell.remove());

      const modesCell = document.createElement("td");
      modesCell.className = "modes-cell";
      modesCell.style.cssText = "text-align: center; padding: 2px;";

      const modesWrapper = document.createElement("div");
      modesWrapper.style.cssText =
        "display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;";

      const savedModes = getSelectedModes(villageId);
      for (let mode = 1; mode <= 4; mode += 1) {
        const label = document.createElement("label");
        label.style.cssText =
          "display: inline-flex; flex-direction: column; align-items: center; cursor: pointer; margin: 2px;";
        label.title = OPTION_TITLES[mode];

        const icon = document.createElement("img");
        icon.src = `https://dsru.innogamescdn.com/asset/8e371e58/graphic//scavenging/options/${mode}.png`;
        icon.style.width = "18px";
        icon.style.height = "18px";
        icon.style.display = "block";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = `mode-checkbox mode-${mode}`;
        checkbox.setAttribute("data-village-id", villageId);
        checkbox.setAttribute("data-mode-id", mode);
        checkbox.style.marginTop = "3px";
        checkbox.style.cursor = "pointer";
        checkbox.checked = savedModes.includes(mode);
        checkbox.addEventListener("change", () => {
          const selected = [];
          for (let i = 1; i <= 4; i += 1) {
            const cb = modesWrapper.querySelector(`.mode-${i}`);
            if (cb?.checked) selected.push(i);
          }
          setSelectedModes(villageId, selected);
        });

        label.appendChild(icon);
        label.appendChild(checkbox);
        modesWrapper.appendChild(label);
      }

      modesCell.appendChild(modesWrapper);
      firstCell.insertAdjacentElement("afterend", modesCell);

      const percentCell = document.createElement("td");
      percentCell.className = "percent-cell";
      percentCell.style.cssText = "text-align: center; padding: 2px;";

      const percentSelect = document.createElement("select");
      percentSelect.className = "troops-percent-select";
      percentSelect.style.cssText =
        "width: 50px; padding: 2px; font-size: 11px; text-align: center; font-weight: bold;";
      percentSelect.setAttribute("data-village-id", villageId);

      for (let percent = 0; percent <= 100; percent += 10) {
        const option = document.createElement("option");
        option.value = percent;
        option.textContent = `${percent}%`;
        if (percent === 100) option.selected = true;
        percentSelect.appendChild(option);
      }

      percentSelect.value = getVillagePercent(villageId);
      percentSelect.addEventListener("change", (event) => {
        setVillagePercent(villageId, event.target.value);
        updateHeaderTotals();
      });

      percentCell.appendChild(percentSelect);
      modesCell.insertAdjacentElement("afterend", percentCell);

      let previousCell = percentCell;
      for (const troop of troopTypes) {
        const troopCell = document.createElement("td");
        troopCell.className = "troops-cell";
        troopCell.style.cssText =
          "text-align: center; font-size: 12px; padding: 4px; white-space: nowrap; vertical-align: middle;";

        const availableCount = troopCounts[troop.key] || 0;

        const enabledCheckbox = document.createElement("input");
        enabledCheckbox.type = "checkbox";
        enabledCheckbox.className = `troop-checkbox troop-${troop.key}`;
        enabledCheckbox.setAttribute("data-village-id", villageId);
        enabledCheckbox.setAttribute("data-troop-type", troop.key);
        enabledCheckbox.style.marginRight = "5px";
        enabledCheckbox.style.cursor = "pointer";
        enabledCheckbox.style.verticalAlign = "middle";
        enabledCheckbox.checked = getTroopEnabled(villageId, troop.key);
        enabledCheckbox.addEventListener("change", (event) => {
          setTroopEnabled(villageId, troop.key, event.target.checked);
          updateHeaderTotals();

          const countSpan = troopCell.querySelector(".troop-count");
          if (!countSpan) return;

          if (!event.target.checked) {
            countSpan.style.color = "#999";
            countSpan.style.textDecoration = "line-through";
          } else {
            countSpan.style.color = "";
            countSpan.style.textDecoration = "";
          }
        });

        const countSpan = document.createElement("span");
        countSpan.className = "troop-count";
        countSpan.textContent = availableCount.toLocaleString();
        countSpan.title = `${availableCount.toLocaleString()} ${troop.name}`;
        countSpan.style.fontWeight = "bold";
        countSpan.style.marginLeft = "5px";

        if (!enabledCheckbox.checked) {
          countSpan.style.color = "#999";
          countSpan.style.textDecoration = "line-through";
        }

        const fineTuningContainer = document.createElement("div");
        fineTuningContainer.className = "fine-tuning-container";
        fineTuningContainer.style.cssText =
          "font-size: 9px; color: #666; line-height: 1.2;";

        const label = document.createElement("div");
        label.textContent = "No more than";
        label.style.cssText = "margin-top: 5px; display: none;";

        const limitInput = document.createElement("input");
        limitInput.type = "text";
        limitInput.className = `troop-limit-input troop-limit-${troop.key}`;
        limitInput.placeholder = "limit";
        limitInput.title = "Maximum (number or %, e.g. 1000 or 50%)";
        limitInput.style.cssText =
          "width: 60px; font-size: 10px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; text-align: center; margin-top: 2px;";
        limitInput.value = getTroopLimit(villageId, troop.key);
        limitInput.addEventListener("change", (event) => {
          setTroopLimit(villageId, troop.key, event.target.value);
        });

        fineTuningContainer.appendChild(label);
        fineTuningContainer.appendChild(limitInput);
        troopCell.appendChild(enabledCheckbox);
        troopCell.appendChild(countSpan);
        troopCell.appendChild(fineTuningContainer);

        previousCell.insertAdjacentElement("afterend", troopCell);
        previousCell = troopCell;
      }
    });

    const selectAllRow = Array.from(table.querySelectorAll("tbody tr")).find(
      (row) => row.querySelector("strong")?.textContent === "Select all"
    );

    if (selectAllRow && !selectAllRow.querySelector(".modes-cell")) {
      const firstCell = selectAllRow.querySelector("td:first-child");

      const modesCell = document.createElement("td");
      modesCell.className = "modes-cell";
      modesCell.style.cssText = "text-align: center; padding: 2px;";

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display: flex; gap: 8px; justify-content: center;";

      for (let mode = 1; mode <= 4; mode += 1) {
        const label = document.createElement("label");
        label.style.cssText =
          "display: inline-flex; flex-direction: column; align-items: center; cursor: pointer; margin: 2px;";
        label.title = `Set ${OPTION_TITLES[mode]} for all villages`;

        const icon = document.createElement("img");
        icon.src = `https://dsru.innogamescdn.com/asset/8e371e58/graphic//scavenging/options/${mode}.png`;
        icon.style.width = "18px";
        icon.style.height = "18px";
        icon.style.display = "block";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = `total-mode-checkbox mode-${mode}`;
        checkbox.style.marginTop = "3px";
        checkbox.style.cursor = "pointer";
        checkbox.checked = true;
        checkbox.addEventListener("change", (event) => {
          const checked = event.target.checked;
          document.querySelectorAll(`.mode-${mode}`).forEach((villageCheckbox) => {
            if (villageCheckbox === checkbox) return;

            villageCheckbox.checked = checked;
            const villageId = villageCheckbox.getAttribute("data-village-id");
            if (!villageId) return;

            const selected = [];
            for (let i = 1; i <= 4; i += 1) {
              const cb = document.querySelector(`.mode-${i}[data-village-id="${villageId}"]`);
              if (cb?.checked) selected.push(i);
            }
            setSelectedModes(villageId, selected);
          });
        });

        label.appendChild(icon);
        label.appendChild(checkbox);
        wrapper.appendChild(label);
      }

      modesCell.appendChild(wrapper);
      firstCell.insertAdjacentElement("afterend", modesCell);

      const percentCell = document.createElement("td");
      percentCell.className = "percent-cell";
      percentCell.style.cssText = "text-align: center; padding: 2px;";

      const selectAllPercent = document.createElement("select");
      selectAllPercent.className = "troops-percent-select total-select";
      selectAllPercent.style.cssText =
        "width: 50px; padding: 2px; font-size: 11px; text-align: center; font-weight: bold;";
      selectAllPercent.title = "Set percent for all villages";

      for (let percent = 0; percent <= 100; percent += 10) {
        const option = document.createElement("option");
        option.value = percent;
        option.textContent = `${percent}%`;
        if (percent === 100) option.selected = true;
        selectAllPercent.appendChild(option);
      }

      selectAllPercent.addEventListener("change", (event) => {
        const selectedPercent = event.target.value;
        document.querySelectorAll(".troops-percent-select").forEach((select) => {
          if (select === selectAllPercent) return;
          select.value = selectedPercent;

          const villageId = select.getAttribute("data-village-id");
          if (villageId) {
            setVillagePercent(villageId, selectedPercent);
          }
        });
      });

      percentCell.appendChild(selectAllPercent);
      modesCell.insertAdjacentElement("afterend", percentCell);

      let previousCell = percentCell;
      for (let i = 0; i < troopTypes.length; i += 1) {
        const totalTroopCell = document.createElement("td");
        totalTroopCell.className = "troops-cell";
        totalTroopCell.style.cssText = "text-align: center; width: 100px; padding: 4px;";

        const countSpan = document.createElement("span");
        countSpan.className = "troop-count";
        countSpan.textContent = "0";
        totalTroopCell.appendChild(countSpan);

        previousCell.insertAdjacentElement("afterend", totalTroopCell);
        previousCell = totalTroopCell;
      }
    }

    updateHeaderTotals();
    updateFineTuningVisibility();
    console.log("Columns added successfully");
    return true;
  }

  async function calculateScavengePlan() {
    console.log("Starting calculation...");

    const table = document.querySelector(".mass-scavenge-table");
    const villageRows = table.querySelectorAll('tbody tr[id^="scavenge_village_"]');
    const planResults = [];

    for (const row of villageRows) {
      const villageId = row.getAttribute("data-id");
      const villageName =
        row.querySelector("td:first-child a")?.textContent.trim() || "Unknown";

      console.log(`Processing: ${villageName} (${villageId})`);

      let percentToUse = 100;
      if (!fineTuningEnabled) {
        const percentSelect = row.querySelector(".troops-percent-select");
        if (percentSelect?.value) {
          percentToUse = parseInt(percentSelect.value, 10) || 100;
        }
      }

      if (!fineTuningEnabled && percentToUse === 0) {
        planResults.push({
          villageName,
          results: [],
          skipped: true,
          reason: "0%",
        });
        continue;
      }

      const selectedModes = getCheckedModesForVillage(villageId);
      if (selectedModes.length === 0) {
        planResults.push({
          villageName,
          results: [],
          skipped: true,
          reason: "no modes",
        });
        continue;
      }

      const troopCells = row.querySelectorAll(".troops-cell");
      if (troopCells.length === 0) continue;

      const availableCounts = {};
      troopTypes.forEach((troop, index) => {
        const cell = troopCells[index];
        const countSpan = cell?.querySelector(".troop-count");
        const rawText = countSpan?.textContent || cell?.textContent || "0";
        availableCounts[troop.key] = parseInt(rawText.replace(/\s/g, ""), 10) || 0;
      });

      const enabledCounts = {};
      let hasActiveTroops = false;
      for (const troop of troopTypes) {
        const checkbox = row.querySelector(`.troop-${troop.key}`);
        const enabled = checkbox ? checkbox.checked : true;
        enabledCounts[troop.key] = enabled ? availableCounts[troop.key] : 0;
        if (enabledCounts[troop.key] > 0) {
          hasActiveTroops = true;
        }
      }

      if (!hasActiveTroops) {
        planResults.push({
          villageName,
          results: [],
          skipped: true,
          reason: "no active troops",
        });
        continue;
      }

      let troopsToSend = {};
      for (const troop of troopTypes) {
        troopsToSend[troop.key] = fineTuningEnabled
          ? enabledCounts[troop.key]
          : Math.floor((enabledCounts[troop.key] * percentToUse) / 100);
      }

      if (fineTuningEnabled) {
        const limits = getVillageLimitConfig(villageId);
        troopsToSend = applyTroopLimits(troopsToSend, limits, availableCounts);
      }

      const hasAnythingToSend = Object.values(troopsToSend).some((count) => count > 0);
      if (!hasAnythingToSend) {
        planResults.push({
          villageName,
          totalToSend: troopsToSend,
          results: [],
          skipped: true,
          reason: "no troops after limits",
        });
        continue;
      }

      const availableModes = [];
      for (const optionId of selectedModes) {
        if (isOptionAvailableForVillage(villageId, optionId, selectedModes)) {
          availableModes.push(optionId);
        }
      }

      if (availableModes.length === 0) {
        planResults.push({
          villageName,
          totalToSend: troopsToSend,
          results: [],
        });
        continue;
      }

      const optionFractions = getOptionFractions(availableModes);

      const villageResults = [];
      for (const { optionId, fraction } of optionFractions) {
        const title = OPTION_TITLES[optionId];
        const modeTroops = {};

        for (const troop of troopTypes) {
          modeTroops[troop.key] = Math.floor(troopsToSend[troop.key] * fraction);
        }

        const cleanedTroops = removeTinyCounts(modeTroops);
        const hasAnyForMode = Object.values(cleanedTroops).some((count) => count > 0);
        if (!hasAnyForMode) continue;

        for (const troop of troopTypes) {
          setUnitInputValue(troop.key, cleanedTroops[troop.key]);
        }

        await new Promise((resolve) => setTimeout(resolve, OPTION_PREVIEW_DELAY_MS));

        const optionPreview = document.querySelector(`.scavenge-option:nth-child(${optionId})`);
        if (optionPreview) {
          const wood = parseInt(
            optionPreview.querySelector(".wood-value")?.textContent.replace(/[^0-9]/g, ""),
            10
          ) || 0;
          const stone = parseInt(
            optionPreview.querySelector(".stone-value")?.textContent.replace(/[^0-9]/g, ""),
            10
          ) || 0;
          const iron = parseInt(
            optionPreview.querySelector(".iron-value")?.textContent.replace(/[^0-9]/g, ""),
            10
          ) || 0;
          const duration = optionPreview.querySelector(".duration")?.textContent || "0:00:00";

          villageResults.push({
            optionId,
            title,
            fraction,
            troopsToSend: { ...cleanedTroops },
            resources: {
              wood,
              stone,
              iron,
              total: wood + stone + iron,
            },
            duration,
          });
        }

        clearScavengeInputs();
        await new Promise((resolve) => setTimeout(resolve, CLEAR_FORM_DELAY_MS));
      }

      planResults.push({
        villageName,
        villageId,
        percent: fineTuningEnabled ? "limits" : percentToUse,
        fineTuningEnabled,
        selectedModes,
        totalToSend: troopsToSend,
        results: villageResults,
      });
    }

    showResultsModal(planResults);
    return planResults;
  }

  async function executeMassSend() {
    console.log("\n╔══════════════════════════════════════════════════════════════════╗");
    console.log("║                      MASS SCAVENGE SEND                        ║");
    console.log("╚══════════════════════════════════════════════════════════════════╝\n");

    const table = document.querySelector(".mass-scavenge-table");
    const villageRows = table.querySelectorAll('tbody tr[id^="scavenge_village_"]');
    let sentOptionsCount = 0;

    for (const row of villageRows) {
      const villageId = row.getAttribute("data-id");
      const villageName =
        row.querySelector("td:first-child a")?.textContent.trim() || "Unknown";

      console.log(`\nProcessing: ${villageName} (${villageId})`);

      let percentToUse = 100;
      if (!fineTuningEnabled) {
        const percentSelect = row.querySelector(".troops-percent-select");
        if (percentSelect?.value) {
          percentToUse = parseInt(percentSelect.value, 10) || 100;
        }
      }

      if (!fineTuningEnabled && percentToUse === 0) {
        console.log("   SKIP: percent = 0%");
        continue;
      }

      const selectedModes = getCheckedModesForVillage(villageId);
      if (selectedModes.length === 0) {
        console.log("   SKIP: no selected modes");
        continue;
      }

      const troopCells = row.querySelectorAll(".troops-cell");
      if (troopCells.length === 0) continue;

      const availableCounts = {};
      troopTypes.forEach((troop, index) => {
        const cell = troopCells[index];
        const countSpan = cell?.querySelector(".troop-count");
        const rawText = countSpan?.textContent || cell?.textContent || "0";
        availableCounts[troop.key] = parseInt(rawText.replace(/\s/g, ""), 10) || 0;
      });

      const enabledCounts = {};
      let hasActiveTroops = false;
      for (const troop of troopTypes) {
        const checkbox = row.querySelector(`.troop-${troop.key}`);
        const enabled = checkbox ? checkbox.checked : true;
        enabledCounts[troop.key] = enabled ? availableCounts[troop.key] : 0;
        if (enabledCounts[troop.key] > 0) hasActiveTroops = true;
      }

      if (!hasActiveTroops) {
        console.log("   SKIP: no active troops");
        continue;
      }

      let troopsToSend = {};
      for (const troop of troopTypes) {
        troopsToSend[troop.key] = fineTuningEnabled
          ? enabledCounts[troop.key]
          : Math.floor((enabledCounts[troop.key] * percentToUse) / 100);
      }

      if (fineTuningEnabled) {
        const limits = getVillageLimitConfig(villageId);
        troopsToSend = applyTroopLimits(troopsToSend, limits, availableCounts);
      }

      const hasAnythingToSend = Object.values(troopsToSend).some((count) => count > 0);
      if (!hasAnythingToSend) {
        console.log("   SKIP: no troops to send");
        continue;
      }

      const availableModes = [];
      for (const optionId of selectedModes) {
        if (isOptionAvailableForVillage(villageId, optionId, selectedModes)) {
          availableModes.push(optionId);
        }
      }

      if (availableModes.length === 0) {
        console.log("   SKIP: no available options");
        continue;
      }

      const optionFractions = getOptionFractions(availableModes);
      for (const { optionId, fraction } of optionFractions) {
        const optionTitle = OPTION_TITLES[optionId];
        console.log(`   Option ${optionId} (${optionTitle})`);

        const optionTroops = {};
        for (const troop of troopTypes) {
          optionTroops[troop.key] = Math.floor(troopsToSend[troop.key] * fraction);
        }

        const cleanedTroops = removeTinyCounts(optionTroops);
        const hasAnyForMode = Object.values(cleanedTroops).some((count) => count > 0);
        if (!hasAnyForMode) {
          console.log("     SKIP: no troops after filtering");
          continue;
        }

        for (const troop of troopTypes) {
          setUnitInputValue(troop.key, cleanedTroops[troop.key]);
        }

        await new Promise((resolve) => setTimeout(resolve, OPTION_PREVIEW_DELAY_MS));

        const selected = selectOnlyThisMode(villageId, optionId);
        if (selected) {
          const sendButton = document.querySelector(".send-row .btn-send");
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
            sentOptionsCount += 1;
            await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
            enableAllControls();
          }
        }

        clearScavengeInputs();
        await new Promise((resolve) => setTimeout(resolve, CLEAR_FORM_DELAY_MS));
      }
    }

    console.log(`\nMass send complete! Options sent: ${sentOptionsCount}\n`);
    return sentOptionsCount;
  }

  function showResultsModal(resultsByVillage) {
    document.getElementById("scavenge-results-modal")?.remove();

    let totalWood = 0;
    let totalStone = 0;
    let totalIron = 0;
    const totalTroops = {};
    for (const troop of troopTypes) {
      totalTroops[troop.key] = 0;
    }

    let totalOptions = 0;
    let longestDuration = "0:00:00";
    let longestDurationSeconds = 0;

    for (const village of resultsByVillage) {
      for (const result of village.results) {
        totalWood += result.resources.wood;
        totalStone += result.resources.stone;
        totalIron += result.resources.iron;

        for (const troop of troopTypes) {
          totalTroops[troop.key] += result.troopsToSend[troop.key] || 0;
        }

        totalOptions += 1;
        const seconds = parseDurationToSeconds(result.duration);
        if (seconds > longestDurationSeconds) {
          longestDurationSeconds = seconds;
          longestDuration = result.duration;
        }
      }
    }

    let villagesHtml = "";

    for (const village of resultsByVillage) {
      if (village.results.length === 0) {
        villagesHtml += `
          <div style="margin-bottom: 25px; background: rgba(255,255,255,0.5); border-radius: 8px; padding: 12px;">
            <h3 style="margin: 0 0 10px 0; color: #2c3e50;">🏠 ${village.villageName}</h3>
            <div style="color: #999; padding: 10px;">
              ⚠️ ${village.skipped ? `Skipped (${village.reason})` : "No available options"}
            </div>
          </div>
        `;
        continue;
      }

      let troopHeaderHtml = "<th style=\"padding: 8px; text-align: center;\">Option</th><th style=\"padding: 8px; text-align: center;\">%</th>";
      for (const troop of troopTypes) {
        troopHeaderHtml += `<th style="padding: 8px; text-align: center;">${troop.icon}</th>`;
      }
      troopHeaderHtml +=
        '<th style="padding: 8px; text-align: center;">🪵</th><th style="padding: 8px; text-align: center;">🪨</th><th style="padding: 8px; text-align: center;">⛓️</th><th style="padding: 8px; text-align: center;">⏱️</th>';

      let rowsHtml = "";
      for (const result of village.results) {
        let troopCells = "";
        for (const troop of troopTypes) {
          troopCells += `<td style="padding: 6px; text-align: right;">${(result.troopsToSend[troop.key] || 0).toLocaleString()}</td>`;
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid rgb(210, 180, 100);">
            <td style="padding: 6px; text-align: center;">${result.optionId} (${result.title})</td>
            <td style="padding: 6px; text-align: center;">${Math.round(result.fraction * 100)}%</td>
            ${troopCells}
            <td style="padding: 6px; text-align: right;">${result.resources.wood.toLocaleString()}</td>
            <td style="padding: 6px; text-align: right;">${result.resources.stone.toLocaleString()}</td>
            <td style="padding: 6px; text-align: right;">${result.resources.iron.toLocaleString()}</td>
            <td style="padding: 6px; text-align: right;">${result.duration}</td>
          </tr>
        `;
      }

      villagesHtml += `
        <div style="margin-bottom: 25px; background: rgba(255,255,255,0.5); border-radius: 8px; padding: 12px;">
          <h3 style="margin: 0 0 10px 0; color: #2c3e50;">
            🏠 ${village.villageName} ${village.fineTuningEnabled ? "(limits)" : `(${village.percent}%)`}
          </h3>
          <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
            📋 Selected modes: ${village.selectedModes?.join(", ") || "all"}
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: rgb(210, 180, 100);">
                ${troopHeaderHtml}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    let totalTroopsHtml = "";
    for (const troop of troopTypes) {
      totalTroopsHtml += `${troop.icon} ${troop.name}: ${totalTroops[troop.key].toLocaleString()}<br>`;
    }

    const worldTypeText = worldHasArchers ? "with archers" : "classic";

    const modalHtml = `
      <div id="scavenge-results-modal" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 1600px; max-height: 85%; background: rgb(244, 228, 188); border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000; display: flex; flex-direction: column; font-family: Arial, sans-serif; border: 2px solid rgb(210, 180, 100);">
        <div style="padding: 15px 20px; background: rgb(210, 180, 100); border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; color: #2c3e50;">📊 Scavenging Calculation Results</h2>
          <button id="close-results-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #2c3e50;">&times;</button>
        </div>
        <div style="padding: 20px; overflow-y: auto; flex: 1;">
          <div style="margin-bottom: 12px; color: #666;">
            🌍 World type: ${worldTypeText}
          </div>
          ${villagesHtml}
          <div style="background: rgb(210, 180, 100); border-radius: 8px; padding: 15px; margin-top: 10px;">
            <h3 style="margin: 0 0 10px 0; color: #2c3e50;">📊 OVERALL STATISTICS</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 20px;">
              <div>
                <strong>📤 TOTAL TROOPS:</strong><br>
                ${totalTroopsHtml}
              </div>
              <div>
                <strong>📦 TOTAL RESOURCES:</strong><br>
                🪵 Wood: ${totalWood.toLocaleString()}<br>
                🪨 Stone: ${totalStone.toLocaleString()}<br>
                ⛓️ Iron: ${totalIron.toLocaleString()}<br>
                💰 <strong>TOTAL: ${(totalWood + totalStone + totalIron).toLocaleString()}</strong>
              </div>
              <div>
                <strong>⏱️ TIME:</strong><br>
                Maximum: ${longestDuration}<br>
                Total options: ${totalOptions}
              </div>
            </div>
          </div>
        </div>
        <div style="padding: 15px 20px; background: rgb(210, 180, 100); border-radius: 0 0 10px 10px; text-align: center;">
          <button id="close-results-modal-footer" style="padding: 8px 20px; background: #2c3e50; color: white; border: none; border-radius: 5px; cursor: pointer;">Close</button>
        </div>
      </div>
      <div id="scavenge-results-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;"></div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const closeModal = () => {
      document.getElementById("scavenge-results-modal")?.remove();
      document.getElementById("scavenge-results-overlay")?.remove();
    };

    document.getElementById("close-results-modal")?.addEventListener("click", closeModal);
    document.getElementById("close-results-modal-footer")?.addEventListener("click", closeModal);
    document.getElementById("scavenge-results-overlay")?.addEventListener("click", closeModal);
  }

  function toggleFineTuning(toggleButton) {
    fineTuningEnabled = !fineTuningEnabled;
    setFineTuningEnabled(fineTuningEnabled);

    if (toggleButton) {
      toggleButton.textContent = fineTuningEnabled
        ? "⚙️ Fine tuning (on)"
        : "⚙️ Fine tuning (off)";
    }

    const percentCells = document.querySelectorAll(".percent-cell");
    const fineTuningContainers = document.querySelectorAll(".fine-tuning-container");
    const percentHeader = document.querySelector(".percent-header");

    if (fineTuningEnabled) {
      percentCells.forEach((cell) => {
        cell.style.display = "none";
      });
      fineTuningContainers.forEach((container) => {
        container.style.display = "block";
      });
      if (percentHeader) percentHeader.style.display = "none";
    } else {
      percentCells.forEach((cell) => {
        cell.style.display = "table-cell";
      });
      fineTuningContainers.forEach((container) => {
        container.style.display = "none";
      });
      if (percentHeader) percentHeader.style.display = "table-cell";
    }

    console.log(
      fineTuningEnabled
        ? "Fine tuning enabled"
        : "Fine tuning disabled"
    );
  }

  function addActionButtons() {
    const sendRow = document.querySelector(".send-row");
    if (!sendRow) return;

    const quickEdit = sendRow.querySelector(".quickedit-vn");
    if (quickEdit) quickEdit.style.display = "none";

    const container = sendRow.querySelector(".buttons-container");
    if (!container) return;

    if (!container.querySelector(".btn-fine-tuning")) {
      const button = document.createElement("a");
      button.href = "#";
      button.className = "btn btn-default btn-fine-tuning";
      button.textContent = fineTuningEnabled ? "⚙️ Fine tuning (on)" : "⚙️ Fine tuning (off)";
      button.title = "Toggle fine tuning of troop limits";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFineTuning(button);
      });
      container.prepend(button);
    }

    if (!container.querySelector(".btn-calculate")) {
      const button = document.createElement("a");
      button.href = "#";
      button.className = "btn btn-default btn-calculate";
      button.textContent = "🧮 Calculate";
      button.title = "Calculate optimal troop distribution";
      button.style.cssText = "margin-right: 5px;";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.textContent = "⏳ Calculating...";
        button.disabled = true;
        await calculateScavengePlan();
        button.textContent = "🧮 Calculate";
        button.disabled = false;
      });

      const fineTuningButton = container.querySelector(".btn-fine-tuning");
      if (fineTuningButton) {
        fineTuningButton.insertAdjacentElement("afterend", button);
      } else {
        container.prepend(button);
      }
    }

    if (!container.querySelector(".btn-mass-send")) {
      const button = document.createElement("a");
      button.href = "#";
      button.className = "btn btn-default btn-mass-send";
      button.textContent = "📦 Mass send";
      button.title = "Mass send to scavenging";
      button.style.cssText = "margin-right: 5px;";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        button.textContent = "⏳ Sending...";
        button.disabled = true;
        await executeMassSend();
        button.textContent = "📦 Mass send";
        button.disabled = false;
      });

      const calculateButton = container.querySelector(".btn-calculate");
      if (calculateButton) {
        calculateButton.insertAdjacentElement("afterend", button);
      } else {
        container.appendChild(button);
      }
    }
  }

  async function init() {
    console.log(`Initializing scavenging script... [${SCRIPT_VERSION}]`);
    console.log(`   Server: ${getWorldCode()}`);
    console.log(`   Current village ID: ${getCurrentVillageId()}`);

    detectWorldAndTroops();
    fineTuningEnabled = getFineTuningEnabled();
    console.log(`   Fine tuning: ${fineTuningEnabled ? "ON" : "OFF"}`);

    if (isMassScavengePage()) {
      runMode = "mass";
      console.log("   Mode: Premium mass scavenging page");
      await addColumnsToScavengeTable();
      addActionButtons();
      console.log("Scavenging script is ready!");
      return;
    }

    if (isSingleScavengePage()) {
      runMode = "single";
      console.log("   Mode: Non-Premium single village page");
      await initSingleVillageMode();
      console.log("Scavenging script is ready!");
      return;
    }

    runMode = "unsupported";
    console.warn(
      "Unsupported page for this script. Open Mass Scavenge (Premium) or Collect (single village)."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
