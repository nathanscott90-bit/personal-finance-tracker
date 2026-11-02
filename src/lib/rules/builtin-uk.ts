import type { BuiltinRule } from "./builtin";

/**
 * UK merchants and payees. Matched case-insensitively; "contains" rules match
 * whole words on the cleaned merchant unless `field: "raw"`. Lower priority
 * numbers win, so the specific cases (Tesco Mobile, Tesco petrol) sit just
 * ahead of the general ones (Tesco).
 */
export const UK_RULES: BuiltinRule[] = [
  // income
  {
    pattern: "\\b(salary|wages|payroll|bgc)\\b",
    category: "income/paycheck",
    field: "raw",
    matchType: "regex",
    direction: "in",
    priority: 10,
  },
  {
    pattern: "\\b(hmrc|child benefit|tax refund)\\b",
    category: "income/other-income",
    field: "raw",
    matchType: "regex",
    direction: "in",
    priority: 10,
  },
  {
    pattern: "\\b(interest|cashback)\\b",
    category: "income/other-income",
    field: "raw",
    matchType: "regex",
    direction: "in",
    priority: 11,
  },

  // fees and interest before any payee rule
  {
    pattern:
      "\\b(overdraft|interest charged|late payment fee|cash fee|non-sterling|foreign transaction fee)\\b",
    category: "debt/interest-fees",
    field: "raw",
    matchType: "regex",
    priority: 12,
  },

  // credit-card repayments to cards that are not imported
  {
    pattern:
      "\\b(credit card|barclaycard|mbna|american express|amex|capital one|vanquis|aqua card|tesco bank|halifax credit|nationwide card)\\b",
    category: "debt/card-payments",
    field: "raw",
    matchType: "regex",
    priority: 20,
  },
  {
    pattern:
      "\\b(klarna|clearpay|paypal pay in 3|zopa|novuna|black horse|close brothers|santander consumer|hitachi capital)\\b",
    category: "debt/loan-payments",
    field: "raw",
    matchType: "regex",
    priority: 20,
  },

  // savings and investing
  {
    pattern:
      "\\b(moneybox|withplum|plum fintech|getchip|chip savings|vanguard|hargreaves lansdown|trading 212|nutmeg|ns&i|nsandi|premium bonds|aj bell|freetrade)\\b",
    category: "savings/savings-investing",
    field: "raw",
    matchType: "regex",
    priority: 20,
  },

  // home
  {
    pattern:
      "\\b(council tax|ctax|city council|district council|borough council|county council)\\b",
    category: "home/council-tax",
    field: "raw",
    matchType: "regex",
    priority: 25,
  },
  {
    pattern: "\\bmortgage\\b",
    category: "home/rent-mortgage",
    field: "raw",
    matchType: "regex",
    priority: 25,
  },
  {
    pattern: "\\b(lettings?|letting agent|rent)\\b",
    category: "home/rent-mortgage",
    field: "raw",
    matchType: "regex",
    priority: 26,
  },
  {
    pattern:
      "\\b(octopus energy|british gas|e\\.?on|edf|ovo|scottish power|sse|so energy|utility warehouse|outfox|good energy|ecotricity|southern water|south east water|affinity water|thames water|anglian water|severn trent|united utilities|yorkshire water|wessex water|welsh water|dwr cymru|water plc|water ltd|water services)\\b",
    category: "home/utilities",
    field: "raw",
    matchType: "regex",
    priority: 25,
  },
  {
    pattern:
      "\\b(aviva|direct line|admiral|lv=|liverpool victoria|churchill|hastings|more than|axa|ageas|zurich|legal & general|legal and general|vitality|bupa|esure|saga|nfu mutual|royal london|aig life|petplan|animal friends|homeserve|domestic & general|domestic and general)\\b",
    category: "home/insurance",
    field: "raw",
    matchType: "regex",
    priority: 25,
  },
  {
    pattern:
      "\\b(b&q|wickes|screwfix|toolstation|homebase|dunelm|ikea|the range|robert dyas|wilko|b & m|b&m|home bargains|travis perkins|jewson)\\b",
    category: "home/repairs-household",
    field: "raw",
    matchType: "regex",
    priority: 30,
  },

  // phone, broadband, TV
  {
    pattern: "\\b(tv licen[cs]e|tvl)\\b",
    category: "bills/subscriptions",
    field: "raw",
    matchType: "regex",
    priority: 25,
  },
  {
    pattern:
      "\\b(bt group|bt\\.com|\\bbt\\b|sky digital|sky uk|sky subscription|virgin media|talktalk|plusnet|vodafone|ee limited|ee ltd|\\bee\\b|o2|three\\.co\\.uk|hutchison 3g|giffgaff|tesco mobile|hyperoptic|community fibre|zen internet|lebara|smarty|id mobile|voxi|lyca)\\b",
    category: "bills/phone-internet",
    field: "raw",
    matchType: "regex",
    priority: 28,
  },

  // subscriptions
  {
    pattern:
      "\\b(disney plus|disneyplus|now tv|nowtv|britbox|audible|amazon prime|prime video|icloud|apple\\.com/bill|google storage|google one|microsoft|xbox|playstation|deezer|paramount\\+|discovery\\+)\\b",
    category: "bills/subscriptions",
    field: "raw",
    matchType: "regex",
    priority: 29,
  },
  {
    pattern:
      "\\b(puregym|the gym group|gym group|david lloyd|nuffield health|anytime fitness|better leisure|everyone active|fusion lifestyle|strava|zwift|british cycling)\\b",
    category: "bills/gym-memberships",
    field: "raw",
    matchType: "regex",
    priority: 29,
  },

  // fuel (ahead of the supermarkets that also sell it)
  {
    pattern:
      "\\b(tesco pfs|tesco petrol|sainsburys petrol|sainsbury's petrol|asda petrol|asda fuel|morrisons fuel|morrisons petrol|\\bbp\\b|esso|texaco|gulf|jet petrol|shell|\\bpfs\\b|petrol|fuel)\\b",
    category: "transport/fuel",
    field: "raw",
    matchType: "regex",
    priority: 29,
  },

  // groceries
  {
    pattern:
      "\\b(tesco|sainsbury'?s?|asda|morrisons|waitrose|aldi|lidl|co-?op|co op|iceland|ocado|farmfoods|spar|budgens|one stop|m&s simply food|marks & spencer food|m&s food|booths|costco)\\b",
    category: "food/groceries",
    field: "raw",
    matchType: "regex",
    priority: 30,
  },

  // transport
  {
    pattern: "\\b(dvla|vehicle tax)\\b",
    category: "transport/car-payment-insurance",
    field: "raw",
    matchType: "regex",
    priority: 25,
  },
  {
    pattern:
      "\\b(tfl|trainline|southeastern|national rail|lner|gwr|avanti|thameslink|stagecoach|arriva|first bus|dart charge|dartford crossing|congestion charge|ringgo|paybyphone|justpark|ncp|apcoa|kwik fit|halfords|ats euromaster|national tyres|uber|bolt)\\b",
    category: "transport/repairs-parking-transit",
    field: "raw",
    matchType: "regex",
    priority: 30,
  },

  // coffee, takeaway, eating out
  {
    pattern:
      "\\b(costa|caffe nero|caffè nero|pret|pret a manger|greggs|deliveroo|just eat|uber eats|starbucks)\\b",
    category: "food/coffee-takeout",
    field: "raw",
    matchType: "regex",
    priority: 29,
  },
  {
    pattern:
      "\\b(nando'?s|wagamama|pizza express|zizzi|prezzo|toby carvery|harvester|wetherspoon|beefeater|frankie & benny|five guys|mcdonalds?|kfc|burger king|subway|domino'?s|papa john'?s|pizza hut|leon|wahaca|honest burgers|gbk|pub)\\b",
    category: "food/restaurants",
    field: "raw",
    matchType: "regex",
    priority: 31,
  },

  // shopping
  {
    pattern:
      "\\b(boots|superdrug|primark|tk maxx|next retail|next plc|h&m|zara|matalan|sports direct|jd sports|decathlon|uniqlo)\\b",
    category: "shopping/clothing-personal-care",
    field: "raw",
    matchType: "regex",
    priority: 31,
  },
  {
    pattern:
      "\\b(amazon|amzn|argos|ebay|currys|john lewis|very\\.co\\.uk|asos|wh smith|whsmith|waterstones|the works|hobbycraft|marks & spencer|marks&spencer|m&s)\\b",
    category: "shopping/general",
    field: "raw",
    matchType: "regex",
    priority: 32,
  },

  // health
  {
    pattern:
      "\\b(pharmacy|chemist|nhs|dentist|dental|opticians?|specsavers|vision express|physio)\\b",
    category: "health/medical-pharmacy",
    field: "raw",
    matchType: "regex",
    priority: 28,
  },

  // travel
  {
    pattern:
      "\\b(easyjet|ryanair|british airways|jet2|tui|premier inn|travelodge|booking\\.com|eurostar|p&o ferries|dfds|airbnb|hotels\\.com|expedia)\\b",
    category: "fun/travel",
    field: "raw",
    matchType: "regex",
    priority: 28,
  },

  // giving
  {
    pattern:
      "\\b(justgiving|cancer research|oxfam|british heart foundation|macmillan|rnli|charity)\\b",
    category: "gifts/gifts-giving",
    field: "raw",
    matchType: "regex",
    priority: 30,
  },
];

/**
 * US rules that misfire on UK statements. "card payment" in particular is
 * how UK banks describe an ordinary debit-card purchase, not a credit-card
 * repayment.
 */
export const US_RULES_EXCLUDED_IN_UK = new Set([
  "card payment",
  "direct dep",
  "\\btarget\\b",
  "\\batt\\b",
]);
