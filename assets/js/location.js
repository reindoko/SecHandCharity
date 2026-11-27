export const LOCATIONS = [
  "Alor Gajah",
  "Alor Setar",
  "Ampang Jaya",
  "Arau",
  "Ayer Keroh",
  "Bachok",
  "Bahau",
  "Bandar Baharu",
  "Baling",
  "Banting",
  "Batu Pahat",
  "Bayan Lepas",
  "Beaufort",
  "Beluran",
  "Bentong",
  "Bera",
  "Besut",
  "Betong",
  "Bidor",
  "Bintulu",
  "Bukit Mertajam",
  "Butterworth",
  "Cameron Highlands",
  "Cyberjaya",
  "Dungun",
  "George Town",
  "Gua Musang",
  "Hulu Selangor",
  "Hulu Terengganu",
  "Ipoh",
  "Iskandar Puteri",
  "Jasin",
  "Jelebu",
  "Jeli",
  "Jerantut",
  "Johor Bahru",
  "Kajang",
  "Kalabakan",
  "Kampar",
  "Kangar",
  "Kapit",
  "Kemaman",
  "Keningau",
  "Kinabatangan",
  "Klang",
  "Kluang",
  "Kota Belud",
  "Kota Bharu",
  "Kota Kinabalu",
  "Kota Krai",
  "Kota Marudu",
  "Kota Samarahan",
  "Kota Tinggi",
  "Kuala Kangsar",
  "Kuala Lumpur",
  "Kuala Nerus",
  "Kuala Penyu",
  "Kuala Pilah",
  "Kuala Selangor",
  "Kuala Terengganu",
  "Kuantan",
  "Kubang Pasu",
  "Kuching",
  "Kudat",
  "Kulai",
  "Kulim",
  "Kunak",
  "Labuan",
  "Lahad Datu",
  "Langkawi",
  "Lawas",
  "Limbang",
  "Lipis",
  "Lumut",
  "Machang",
  "Manjung",
  "Maran",
  "Marang",
  "Melaka City",
  "Mersing",
  "Miri",
  "Muar",
  "Mukah",
  "Nabawan",
  "Nibong Tebal",
  "Nilai",
  "Padang Besar",
  "Padang Terap",
  "Papar",
  "Pasir Gudang",
  "Pasir Mas",
  "Pasir Puteh",
  "Pekan",
  "Penampang",
  "Pendang",
  "Petaling Jaya",
  "Pitas",
  "Pontian",
  "Port Dickson",
  "Putatan",
  "Putrajaya",
  "Ranau",
  "Raub",
  "Rawang",
  "Rembau",
  "Rompin",
  "Sabak Bernam",
  "Sandakan",
  "Sarikei",
  "Segamat",
  "Selayang",
  "Semporna",
  "Sepang",
  "Seremban",
  "Serian",
  "Setiu",
  "Shah Alam",
  "Sibu",
  "Sik",
  "Sipitang",
  "Sitiawan",
  "Sri Aman",
  "Subang Jaya",
  "Sungai Petani",
  "Sungai Siput",
  "Taiping",
  "Tambunan",
  "Tampin",
  "Tanah Merah",
  "Tanjung Malim",
  "Tapah",
  "Tawau",
  "Teluk Intan",
  "Temerloh",
  "Tenom",
  "Tuaran",
  "Tumpat",
  "Yan",
];

export function populateLocationSelect(
  selectEl,
  { includeAllOption = false, selectedValue = "" } = {}
) {
  if (!selectEl) return;

  const placeholder = selectEl.querySelector('option[value=""]');
  selectEl.innerHTML = "";

  if (placeholder) {
    placeholder.selected = !selectedValue;
    selectEl.appendChild(placeholder);
  }

  if (includeAllOption) {
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Locations";
    if (!selectedValue && !placeholder) {
      allOption.selected = true;
    }
    selectEl.appendChild(allOption);
  }

  for (const location of LOCATIONS) {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = location;
    if (location === selectedValue) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  }
}

// Adds a dropdown to search inputs
export function attachLocationFilter(searchInputEl, listContainerEl, onSelectLocation) {
  if (!searchInputEl || !listContainerEl) return;

  // Filters locations and outputs based on search input
  function renderList(query = "") {
    const cleanQuery = query.trim().toLowerCase();
    const matches = LOCATIONS.filter((loc) => loc.toLowerCase().includes(cleanQuery));

    listContainerEl.innerHTML = "";

    if (matches.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "location-option-empty";
      emptyEl.textContent = "No matching area";
      listContainerEl.appendChild(emptyEl);
      return;
    }

    for (const loc of matches) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "location-option-item";
      btn.textContent = loc;
      btn.addEventListener("click", () => {
        searchInputEl.value = loc;
        listContainerEl.classList.add("is-hidden");
        if (typeof onSelectLocation === "function") {
          onSelectLocation(loc);
        }
      });
      listContainerEl.appendChild(btn);
    }
  }

  searchInputEl.addEventListener("focus", () => {
    renderList(searchInputEl.value);
    listContainerEl.classList.remove("is-hidden");
  });

  searchInputEl.addEventListener("input", () => {
    renderList(searchInputEl.value);
    listContainerEl.classList.remove("is-hidden");
    if (typeof onSelectLocation === "function") {
      onSelectLocation("");
    }
  });

  document.addEventListener("click", (event) => {
    if (!searchInputEl.contains(event.target) && !listContainerEl.contains(event.target)) {
      listContainerEl.classList.add("is-hidden");
    }
  });
}