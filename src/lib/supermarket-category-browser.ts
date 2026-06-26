type BrowseDeal = {
  category?: string | null;
  subcategory?: string | null;
  productName?: string | null;
  imageUrl?: string | null;
};

export type SupermarketBrowsePath = {
  topKey: string;
  groupKey: string;
  leafKey?: string | null;
};

export type SupermarketBrowseNode = {
  key: string;
  label: string;
  count: number;
  image: string | null;
  children: SupermarketBrowseNode[];
};

const FOOD_CATEGORIES = [
  'Φρούτα & Λαχανικά',
  'Κρέας & Ψάρι',
  'Γαλακτοκομικά & Είδη Ψυγείου',
  'Τυριά & Αλλαντικά',
  'Σαλάτες & Αλοιφές',
  'Αρτοποιία',
  'Κατεψυγμένα',
  'Κονσέρβες',
  'Είδη Παντοπωλείου',
  'Σνακ & Γλυκά',
] as const;

const TOP_META: Record<string, { label: string; image: string; order: number }> = {
  food: {
    label: 'Τρόφιμα',
    image: '/wolt_images/bf75f078-7ccd-11ed-ab2d-2219410922bf_eidh_pantopoleiou.jpeg',
    order: 0,
  },
  drinks: {
    label: 'Ποτά & Ροφήματα',
    image: '/wolt_images/0589c9ea-7cce-11ed-8aac-8ef139468106_kava.jpeg',
    order: 1,
  },
  personal: {
    label: 'Προσωπική Φροντίδα',
    image: '/wolt_images/354e7f2c-7cce-11ed-b240-5e58da96a5fe_prosopiki_peripoihsh.jpeg',
    order: 2,
  },
  home: {
    label: 'Καθαριότητα & Σπίτι',
    image: '/wolt_images/b59b4f08-7ccd-11ed-8bb1-8ef139468106_eidh_katharismou.jpeg',
    order: 3,
  },
  baby: {
    label: 'Βρεφικά',
    image: '/wolt_images/4446c0f2-7cce-11ed-a90e-8ef139468106_vrefiki_frodida.jpeg',
    order: 4,
  },
  pets: {
    label: 'Είδη για Κατοικίδια',
    image: '/wolt_images/fe4096d2-7ccd-11ed-8267-9a91323a0ded_katoikidia.jpeg',
    order: 5,
  },
  other: {
    label: 'Λοιπές Προσφορές',
    image: '/wolt_images/e5fdbe42-006b-11ef-a292-7a97d6143420_0ed565b2_c0cb_11ee_86cf_462127ea1368_78b7f69e_7cce_11ed_9bd9_fa35719a5670_prosfores.jpeg',
    order: 6,
  },
};

const GROUP_META: Record<string, { label: string; order: number; image?: string }> = {
  fruit: { label: 'Φρούτα & Λαχανικά', order: 0, image: '/wolt_images/d655be0a-4213-11f0-aa46-5ef476330e15_1b59dada_7cce_11ed_b54d_4ab428ea4e1c_manaviko.jpeg' },
  meat: { label: 'Κρέας & Ψάρι', order: 1, image: '/wolt_images/14b6c918-7cce-11ed-bf7d-6ecac1adf380_kreopoleio.jpeg' },
  dairy: { label: 'Γαλακτοκομικά & Ψυγείο', order: 2, image: '/wolt_images/dd7103ce-7ccd-11ed-8919-be62703e1729_eidh_psigieiou.jpeg' },
  cheese: { label: 'Τυριά & Αλλαντικά', order: 3 },
  deli: { label: 'Σαλάτες & Αλοιφές', order: 4, image: '/wolt_images/9d7628f8-7ccd-11ed-85f3-6ecac1adf380_dressing.jpeg' },
  bakery: { label: 'Αρτοποιείο & Πρωινό', order: 5, image: '/wolt_images/95e6c05c-7ccd-11ed-9536-5e58da96a5fe_artozaharoplasteio.jpeg' },
  frozen: { label: 'Κατεψυγμένα', order: 6, image: '/wolt_images/a54d2766-7ccd-11ed-bdf3-8ef139468106_eidh_katapsixis.jpeg' },
  pantry: { label: 'Μαγειρική & Παντοπωλείο', order: 7, image: '/wolt_images/bf75f078-7ccd-11ed-ab2d-2219410922bf_eidh_pantopoleiou.jpeg' },
  canned: { label: 'Κονσέρβες', order: 8, image: '/wolt_images/0d4c88c0-7cce-11ed-8a66-3a7ee2063dc0_konservoeidh.jpeg' },
  snacks: { label: 'Σνακ & Γλυκά', order: 9, image: '/wolt_images/3ce09afe-7cce-11ed-b8b5-0248dfe0b315_snacks.jpeg' },
  breakfast: { label: 'Δημητριακά & Είδη Πρωινού', order: 10, image: '/wolt_images/22d03a66-7cce-11ed-8954-6ecac1adf380_proina.jpeg' },
  alcohol: { label: 'Αλκοολούχα Ποτά', order: 0 },
  coffee: { label: 'Καφές', order: 1 },
  juice: { label: 'Χυμοί', order: 2 },
  tea: { label: 'Τσάι & Ροφήματα', order: 3 },
  water: { label: 'Νερά', order: 4 },
  'soft-drinks': { label: 'Αναψυκτικά & Energy Drinks', order: 5 },
  'drinks-other': { label: 'Άλλα Ποτά', order: 6 },
  hair: { label: 'Μαλλιά', order: 0 },
  body: { label: 'Σώμα & Υγιεινή', order: 1 },
  face: { label: 'Πρόσωπο & Καλλυντικά', order: 2 },
  oral: { label: 'Στοματική Υγιεινή', order: 3 },
  feminine: { label: 'Γυναικεία Φροντίδα', order: 4 },
  shaving: { label: 'Ξύρισμα & Ανδρική Φροντίδα', order: 5 },
  'personal-other': { label: 'Λοιπή Προσωπική Φροντίδα', order: 6 },
  laundry: { label: 'Ρούχα & Πλυντήριο', order: 0 },
  kitchen: { label: 'Κουζίνα & Πιάτα', order: 1 },
  paper: { label: 'Χαρτικά', order: 2 },
  bathroom: { label: 'Μπάνιο', order: 3 },
  insect: { label: 'Εντομοκτόνα & Απωθητικά', order: 4 },
  cleaning: { label: 'Καθαριστικά Σπιτιού', order: 5 },
  'home-other': { label: 'Λοιπά Είδη Σπιτιού', order: 6 },
  'baby-food': { label: 'Βρεφικές Τροφές', order: 0 },
  diapers: { label: 'Πάνες', order: 1 },
  wipes: { label: 'Μωρομάντηλα', order: 2 },
  'baby-care': { label: 'Βρεφική Φροντίδα', order: 3 },
  dogs: { label: 'Σκύλοι', order: 0 },
  cats: { label: 'Γάτες', order: 1 },
  'pets-other': { label: 'Λοιπά για Κατοικίδια', order: 2 },
  other: { label: 'Λοιπές Προσφορές', order: 0 },
};

const LEAF_META: Record<string, { label: string; order: number }> = {
  beer: { label: 'Μπύρες & Μηλίτες', order: 0 },
  wine: { label: 'Κρασιά & Αφρώδη', order: 1 },
  spirits: { label: 'Ποτά & Αποστάγματα', order: 2 },
  espresso: { label: 'Espresso & Κάψουλες', order: 0 },
  greek: { label: 'Ελληνικός Καφές', order: 1 },
  instant: { label: 'Στιγμιαίος Καφές', order: 2 },
  filter: { label: 'Καφές Φίλτρου', order: 3 },
  'coffee-other': { label: 'Άλλοι Καφέδες', order: 4 },
};

const FOOD_GROUP: Record<string, string> = {
  'Φρούτα & Λαχανικά': 'fruit',
  'Κρέας & Ψάρι': 'meat',
  'Γαλακτοκομικά & Είδη Ψυγείου': 'dairy',
  'Τυριά & Αλλαντικά': 'cheese',
  'Σαλάτες & Αλοιφές': 'deli',
  Αρτοποιία: 'bakery',
  Κατεψυγμένα: 'frozen',
  Κονσέρβες: 'canned',
  'Είδη Παντοπωλείου': 'pantry',
  'Σνακ & Γλυκά': 'snacks',
};

const normalize = (value: string | null | undefined) =>
  (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function breakfastGroup(name: string): SupermarketBrowsePath {
  if (/(καφε|coffee|nescafe|espresso|nespresso|καπουτσιν|φραπε)/.test(name)) {
    let leafKey = 'coffee-other';
    if (/(espresso|nespresso|καψουλ)/.test(name)) leafKey = 'espresso';
    else if (/(ελληνικ)/.test(name)) leafKey = 'greek';
    else if (/(στιγμιαι|nescafe|φραπε)/.test(name)) leafKey = 'instant';
    else if (/(φιλτρ|filter)/.test(name)) leafKey = 'filter';
    return { topKey: 'drinks', groupKey: 'coffee', leafKey };
  }
  if (/(χυμο|νεκταρ|φρουτοποτο)/.test(name)) return { topKey: 'drinks', groupKey: 'juice' };
  if (/(τσαι|tea\b|κακαο|cacao|ροφημα)/.test(name)) return { topKey: 'drinks', groupKey: 'tea' };
  return { topKey: 'food', groupKey: 'breakfast' };
}

function drinksGroup(name: string): SupermarketBrowsePath {
  if (/(μπυρ|μπιρ|beer|lager|pils|weiss|ale\b|stout|μηλιτ|cider|somersby)/.test(name)) {
    return { topKey: 'drinks', groupKey: 'alcohol', leafKey: 'beer' };
  }
  if (/(κρασι|οινο|wine|σαμπαν|prosecco|αφρωδ|ρετσιν|ροζε)/.test(name)) {
    return { topKey: 'drinks', groupKey: 'alcohol', leafKey: 'wine' };
  }
  if (/(ουζο|τσιπουρ|βοτκ|vodka|ουισκ|whisk|τζιν|gin\b|ρουμι|rum\b|λικερ|tequila|aperitif|brandy|κονιακ)/.test(name)) {
    return { topKey: 'drinks', groupKey: 'alcohol', leafKey: 'spirits' };
  }
  if (/(νερο|water|εμφιαλωμεν|μεταλλικο|επιτραπεζιο)/.test(name)) return { topKey: 'drinks', groupKey: 'water' };
  if (/(αναψυκ|cola|coca|pepsi|fanta|sprite|σοδα|soda|tonic|λεμοναδ|πορτοκαλαδ|γκαζοζ|energy drink|red bull|monster|powerade|schweppes)/.test(name)) {
    return { topKey: 'drinks', groupKey: 'soft-drinks' };
  }
  return { topKey: 'drinks', groupKey: 'drinks-other' };
}

function personalGroup(text: string): string {
  if (/(μαλλ|σαμπουαν|conditioner|hair|λακ\b|βαφ)/.test(text)) return 'hair';
  if (/(στομα|οδοντ|tooth|mouth)/.test(text)) return 'oral';
  if (/(σερβιετ|ταμπον|γυναικ|intim)/.test(text)) return 'feminine';
  if (/(ξυρ|after shave|ανδρ|shav)/.test(text)) return 'shaving';
  if (/(προσωπ|μακιγιαζ|makeup|μασκα|serum)/.test(text)) return 'face';
  if (/(σωμα|αφρολουτρ|σαπουν|αποσμητ|κρεμα|αντηλιακ|sun\b)/.test(text)) return 'body';
  return 'personal-other';
}

function homeGroup(text: string): string {
  if (/(ρουχ|πλυντηρ|μαλακτικ|σιδερ|laundry)/.test(text)) return 'laundry';
  if (/(πιατ|κουζιν|λιποκαθαρ|σφουγγαρ|dish)/.test(text)) return 'kitchen';
  if (/(χαρτ|χαρτο|ρολο|paper|αλουμινοχαρτ|μεμβραν)/.test(text)) return 'paper';
  if (/(μπανιο|τουαλετ|wc\b)/.test(text)) return 'bathroom';
  if (/(εντομ|κουνουπ|κατσαριδ|σκοροκτον)/.test(text)) return 'insect';
  if (/(καθαρισ|χλωριν|πατωμ|τζαμι|σκον|clean)/.test(text)) return 'cleaning';
  return 'home-other';
}

function babyGroup(text: string): string {
  if (/(τροφη|κρεμα|γαλα|γευμα|μπισκοτ|food)/.test(text)) return 'baby-food';
  if (/(πανε|diaper|pants|pampers|babylino)/.test(text)) return 'diapers';
  if (/(μωρομαντ|μαντηλ|wipe)/.test(text)) return 'wipes';
  return 'baby-care';
}

function petsGroup(text: string): string {
  if (/(σκυλ|dog|canin)/.test(text)) return 'dogs';
  if (/(γατ|cat|feline)/.test(text)) return 'cats';
  return 'pets-other';
}

export function supermarketBrowsePath(deal: BrowseDeal): SupermarketBrowsePath {
  const category = deal.category || 'Άλλο';
  const name = normalize(deal.productName);
  const text = `${normalize(deal.subcategory)} ${name}`;

  if (category === 'Κάβα') return drinksGroup(name);
  if (category === 'Πρωινό & Ροφήματα') return breakfastGroup(name);
  if (FOOD_CATEGORIES.includes(category as typeof FOOD_CATEGORIES[number])) {
    return { topKey: 'food', groupKey: FOOD_GROUP[category] || 'pantry' };
  }
  if (category === 'Προσωπική Φροντίδα') return { topKey: 'personal', groupKey: personalGroup(text) };
  if (category === 'Είδη Καθαρισμού & Σπιτιού') return { topKey: 'home', groupKey: homeGroup(text) };
  if (category === 'Βρεφικά Είδη') return { topKey: 'baby', groupKey: babyGroup(text) };
  if (category === 'Είδη Κατοικιδίων') return { topKey: 'pets', groupKey: petsGroup(text) };
  return { topKey: 'other', groupKey: 'other' };
}

function nodeMeta(
  key: string,
  level: 'top' | 'group' | 'leaf'
): { label: string; order: number; image?: string | null } {
  if (level === 'top') return TOP_META[key] || { label: key, image: null, order: 999 };
  if (level === 'group') return GROUP_META[key] || { label: key, order: 999 };
  return LEAF_META[key] || { label: key, order: 999 };
}

export function buildSupermarketCategoryTree(deals: BrowseDeal[]): SupermarketBrowseNode[] {
  const tops = new Map<string, SupermarketBrowseNode>();

  for (const deal of deals) {
    const path = supermarketBrowsePath(deal);
    const topInfo = nodeMeta(path.topKey, 'top');
    const groupInfo = nodeMeta(path.groupKey, 'group');
    const dealImage = deal.imageUrl || null;

    if (!tops.has(path.topKey)) {
      tops.set(path.topKey, {
        key: path.topKey,
        label: topInfo.label,
        count: 0,
        image: topInfo.image || null,
        children: [],
      });
    }
    const top = tops.get(path.topKey)!;
    top.count += 1;

    let group = top.children.find((node) => node.key === path.groupKey);
    if (!group) {
      group = {
        key: path.groupKey,
        label: groupInfo.label,
        count: 0,
        image: groupInfo.image || dealImage || top.image,
        children: [],
      };
      top.children.push(group);
    }
    group.count += 1;
    if (!group.image && dealImage) group.image = dealImage;

    if (path.leafKey) {
      const leafInfo = nodeMeta(path.leafKey, 'leaf');
      let leaf = group.children.find((node) => node.key === path.leafKey);
      if (!leaf) {
        leaf = {
          key: path.leafKey,
          label: leafInfo.label,
          count: 0,
          image: dealImage || group.image,
          children: [],
        };
        group.children.push(leaf);
      }
      leaf.count += 1;
      if (!leaf.image && dealImage) leaf.image = dealImage;
    }
  }

  const sortNodes = (nodes: SupermarketBrowseNode[], level: 'top' | 'group' | 'leaf') => {
    nodes.sort((a, b) => nodeMeta(a.key, level).order - nodeMeta(b.key, level).order);
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children, level === 'top' ? 'group' : 'leaf');
    }
  };

  const result = [...tops.values()];
  sortNodes(result, 'top');
  return result;
}

export function supermarketBrowsePathMatches(deal: BrowseDeal, selected: SupermarketBrowsePath): boolean {
  const actual = supermarketBrowsePath(deal);
  return actual.topKey === selected.topKey
    && actual.groupKey === selected.groupKey
    && (!selected.leafKey || actual.leafKey === selected.leafKey);
}

export function supermarketBrowseCandidateCategories(topKey: string): string[] {
  if (topKey === 'food') return [...FOOD_CATEGORIES, 'Πρωινό & Ροφήματα'];
  if (topKey === 'drinks') return ['Κάβα', 'Πρωινό & Ροφήματα'];
  if (topKey === 'personal') return ['Προσωπική Φροντίδα'];
  if (topKey === 'home') return ['Είδη Καθαρισμού & Σπιτιού'];
  if (topKey === 'baby') return ['Βρεφικά Είδη'];
  if (topKey === 'pets') return ['Είδη Κατοικιδίων'];
  return ['Άλλο'];
}
