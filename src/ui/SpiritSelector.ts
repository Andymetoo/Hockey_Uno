import type { SpiritProfile } from "../core/types";

export function renderSpiritSelector(spirits: SpiritProfile[], selectedId: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "panel";

  const label = document.createElement("label");
  label.className = "field-label";
  label.htmlFor = "spirit-select";
  label.textContent = "Spirit";

  const select = document.createElement("select");
  select.id = "spirit-select";
  select.className = "field-input";

  for (const spirit of spirits) {
    const option = document.createElement("option");
    option.value = spirit.id;
    option.textContent = `${spirit.name} (${spirit.id})`;
    option.selected = spirit.id === selectedId;
    select.append(option);
  }

  wrapper.append(label, select);
  return wrapper;
}
