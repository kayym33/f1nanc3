// Known UK services: what to call them, whether they're a subscription or
// a bill, and where to manage or cancel them. Matched against a payment's
// merchant (categories.js merchantOf) at the start of a word, like the
// category keywords; a trailing space means the whole word only. First
// match wins, so put longer names before shorter ones they contain.
// Links go to the account or subscription page where there is one.

export const SERVICES = [
  // Streaming and entertainment
  { name: "Netflix", kind: "subscription", match: ["netflix"], url: "https://www.netflix.com/account" },
  { name: "Spotify", kind: "subscription", match: ["spotify"], url: "https://www.spotify.com/uk/account/subscription/" },
  { name: "Disney+", kind: "subscription", match: ["disney plus", "disneyplus", "disney+"], url: "https://www.disneyplus.com/account" },
  { name: "Amazon Prime", kind: "subscription", match: ["amazon prime", "amzn prime", "prime video", "primevideo"], url: "https://www.amazon.co.uk/mc" },
  { name: "Kindle Unlimited", kind: "subscription", match: ["kindle unltd", "kindle unlimited"], url: "https://www.amazon.co.uk/kindle-dbs/ku/ku-central" },
  { name: "Audible", kind: "subscription", match: ["audible"], url: "https://www.audible.co.uk/account/overview" },
  { name: "Crunchyroll", kind: "subscription", match: ["crunchyroll"], url: "https://www.crunchyroll.com/account/membership" },
  { name: "YouTube Premium", kind: "subscription", match: ["youtube", "google youtube"], url: "https://www.youtube.com/paid_memberships" },
  { name: "NOW", kind: "subscription", match: ["now tv", "nowtv", "now entertainment"], url: "https://www.nowtv.com/gb/account" },
  { name: "Paramount+", kind: "subscription", match: ["paramount"], url: "https://www.paramountplus.com/account/" },
  { name: "Apple TV+", kind: "subscription", match: ["apple tv"], url: "https://tv.apple.com/settings" },
  { name: "DAZN", kind: "subscription", match: ["dazn "], url: "https://www.dazn.com/en-GB/myaccount" },
  { name: "Twitch", kind: "subscription", match: ["twitch"], url: "https://www.twitch.tv/subscriptions" },
  { name: "Patreon", kind: "subscription", match: ["patreon"], url: "https://www.patreon.com/settings/memberships" },
  { name: "Tidal", kind: "subscription", match: ["tidal "], url: "https://account.tidal.com/subscription" },
  { name: "Deezer", kind: "subscription", match: ["deezer"], url: "https://www.deezer.com/account/subscription" },
  // Games
  { name: "PlayStation Plus", kind: "subscription", match: ["playstation", "sony interactive", "psn "], url: "https://www.playstation.com/acct/management" },
  { name: "Xbox", kind: "subscription", match: ["xbox"], url: "https://account.microsoft.com/services" },
  { name: "Nintendo Switch Online", kind: "subscription", match: ["nintendo"], url: "https://ec.nintendo.com/my/membership" },
  { name: "Discord Nitro", kind: "subscription", match: ["discord"], url: "https://discord.com/settings/subscriptions" },
  // Apps, software and AI
  { name: "Claude", kind: "subscription", match: ["claude.ai", "claude ", "anthropic"], url: "https://claude.ai/settings/billing" },
  { name: "ChatGPT", kind: "subscription", match: ["openai", "chatgpt"], url: "https://chatgpt.com/#settings/Subscription" },
  { name: "Google One", kind: "subscription", match: ["google one", "google storage", "googleone"], url: "https://one.google.com/settings" },
  { name: "Apple", kind: "subscription", match: ["apple.com", "apple services", "itunes"], url: "https://apps.apple.com/account/subscriptions" },
  { name: "Microsoft", kind: "subscription", match: ["microsoft", "msft "], url: "https://account.microsoft.com/services" },
  { name: "Adobe", kind: "subscription", match: ["adobe"], url: "https://account.adobe.com/plans" },
  { name: "Dropbox", kind: "subscription", match: ["dropbox"], url: "https://www.dropbox.com/account/plan" },
  { name: "GitHub", kind: "subscription", match: ["github"], url: "https://github.com/settings/billing" },
  { name: "Canva", kind: "subscription", match: ["canva "], url: "https://www.canva.com/settings/billing-and-plans" },
  { name: "Notion", kind: "subscription", match: ["notion"], url: "https://www.notion.so/" },
  { name: "Proton", kind: "subscription", match: ["proton"], url: "https://account.proton.me/" },
  { name: "NordVPN", kind: "subscription", match: ["nordvpn", "nord vpn", "nordsec"], url: "https://my.nordaccount.com/" },
  { name: "ExpressVPN", kind: "subscription", match: ["expressvpn"], url: "https://www.expressvpn.com/subscriptions" },
  { name: "Duolingo", kind: "subscription", match: ["duolingo"], url: "https://www.duolingo.com/settings/subscription" },
  { name: "Headspace", kind: "subscription", match: ["headspace"], url: "https://www.headspace.com/" },
  { name: "Strava", kind: "subscription", match: ["strava"], url: "https://www.strava.com/account" },
  { name: "1Password", kind: "subscription", match: ["1password"], url: "https://my.1password.com/" },
  // Food and travel memberships
  { name: "Deliveroo Plus", kind: "subscription", match: ["deliveroo plus"], url: "https://deliveroo.co.uk/account" },
  { name: "Uber One", kind: "subscription", match: ["uber one"], url: "https://account.uber.com/" },
  { name: "Just Eat+", kind: "subscription", match: ["just eat plus"], url: "https://www.just-eat.co.uk/account" },
  // Gyms
  { name: "PureGym", kind: "subscription", match: ["puregym", "pure gym"], url: "https://www.puregym.com/members/" },
  { name: "The Gym Group", kind: "subscription", match: ["the gym group", "gym group"], url: "https://www.thegymgroup.com/login/" },
  { name: "Anytime Fitness", kind: "subscription", match: ["anytime fitness"], url: "https://www.anytimefitness.co.uk/" },
  { name: "David Lloyd", kind: "subscription", match: ["david lloyd"], url: "https://www.davidlloyd.co.uk/" },
  { name: "Nuffield Health", kind: "subscription", match: ["nuffield"], url: "https://www.nuffieldhealth.com/account" },

  // Energy
  { name: "Octopus Energy", kind: "bill", match: ["octopus"], url: "https://octopus.energy/dashboard/" },
  { name: "British Gas", kind: "bill", match: ["british gas"], url: "https://www.britishgas.co.uk/my-account" },
  { name: "EDF", kind: "bill", match: ["edf "], url: "https://my.edfenergy.com/" },
  { name: "E.ON Next", kind: "bill", match: ["e.on", "eon next", "eon "], url: "https://www.eonnext.com/dashboard" },
  { name: "OVO", kind: "bill", match: ["ovo "], url: "https://account.ovoenergy.com/" },
  { name: "Scottish Power", kind: "bill", match: ["scottish power", "scottishpower"], url: "https://www.scottishpower.co.uk/my-account" },
  { name: "Utility Warehouse", kind: "bill", match: ["utility warehouse"], url: "https://uw.co.uk/myaccount" },
  // Water and council tax
  { name: "Thames Water", kind: "bill", match: ["thames water"], url: "https://www.thameswater.co.uk/my-account" },
  { name: "Scottish Water", kind: "bill", match: ["scottish water"], url: "https://www.scottishwater.co.uk/" },
  { name: "Council tax", kind: "bill", match: ["council tax", "council "], url: null },
  { name: "TV Licence", kind: "bill", match: ["tv licen", "tvl "], url: "https://www.tvlicensing.co.uk/your-account" },
  // Phone and broadband
  { name: "EE", kind: "bill", match: ["ee "], url: "https://id.ee.co.uk/" },
  { name: "Vodafone", kind: "bill", match: ["vodafone"], url: "https://www.vodafone.co.uk/myvodafone" },
  { name: "O2", kind: "bill", match: ["o2 ", "telefonica"], url: "https://www.o2.co.uk/myo2" },
  { name: "Three", kind: "bill", match: ["three ", "hutchison"], url: "https://www.three.co.uk/My3" },
  { name: "giffgaff", kind: "bill", match: ["giffgaff"], url: "https://www.giffgaff.com/dashboard" },
  { name: "Smarty", kind: "bill", match: ["smarty"], url: "https://smarty.co.uk/account" },
  { name: "VOXI", kind: "bill", match: ["voxi"], url: "https://www.voxi.co.uk/account" },
  { name: "Lebara", kind: "bill", match: ["lebara"], url: "https://www.lebara.co.uk/en/account.html" },
  { name: "Tesco Mobile", kind: "bill", match: ["tesco mobile"], url: "https://www.tescomobile.com/my-account" },
  { name: "iD Mobile", kind: "bill", match: ["id mobile"], url: "https://www.idmobile.co.uk/myaccount" },
  { name: "Sky", kind: "bill", match: ["sky "], url: "https://www.sky.com/myaccount" },
  { name: "Virgin Media", kind: "bill", match: ["virgin media", "virgin mobile"], url: "https://www.virginmedia.com/my-virgin-media" },
  { name: "BT", kind: "bill", match: ["bt "], url: "https://my.bt.com/" },
  { name: "TalkTalk", kind: "bill", match: ["talktalk"], url: "https://www.talktalk.co.uk/account" },
  { name: "Plusnet", kind: "bill", match: ["plusnet"], url: "https://www.plus.net/member-centre/" },
  { name: "Hyperoptic", kind: "bill", match: ["hyperoptic"], url: "https://www.hyperoptic.com/account/" },
  { name: "Community Fibre", kind: "bill", match: ["community fibre"], url: "https://www.communityfibre.co.uk/" },
  // Finance and buy-now-pay-later repayments: fixed until they're paid off.
  { name: "Klarna", kind: "bill", match: ["klarna"], url: "https://app.klarna.com/" },
  { name: "V12 Retail Finance", kind: "bill", match: ["v12 retail", "v12 finance"], url: "https://www.v12retailfinance.com/" },
  { name: "PayPal Pay in 3", kind: "bill", match: ["paypal pay in", "pay in 3"], url: "https://www.paypal.com/myaccount/" },
  { name: "Clearpay", kind: "bill", match: ["clearpay"], url: "https://www.clearpay.co.uk/" },
  { name: "Laybuy", kind: "bill", match: ["laybuy"], url: "https://www.laybuy.com/" },
  { name: "Zilch", kind: "bill", match: ["zilch"], url: "https://www.zilch.com/uk/" },
  { name: "Creation Finance", kind: "bill", match: ["creation finance", "creation.co"], url: "https://www.creation.co.uk/" },
  { name: "NewDay", kind: "bill", match: ["newday", "aqua card", "marbles"], url: "https://www.newday.co.uk/" },
  // Car and insurance
  { name: "VW Financial Services", kind: "bill", match: ["vwfs", "volkswagen financial"], url: "https://www.vwfs.co.uk/" },
  { name: "Black Horse", kind: "bill", match: ["black horse"], url: "https://www.blackhorse.co.uk/" },
  { name: "Santander Consumer Finance", kind: "bill", match: ["santander consumer"], url: "https://www.santanderconsumer.co.uk/" },
  { name: "Close Brothers Motor Finance", kind: "bill", match: ["close brothers"], url: "https://www.closebrothersmotorfinance.com/" },
  { name: "MotoNovo", kind: "bill", match: ["motonovo"], url: "https://www.motonovofinance.com/" },
  { name: "Moneybarn", kind: "bill", match: ["moneybarn"], url: "https://www.moneybarn.com/" },
  { name: "DVLA vehicle tax", kind: "bill", match: ["dvla"], url: "https://www.gov.uk/vehicle-tax" },
  { name: "Admiral", kind: "bill", match: ["admiral"], url: "https://www.admiral.com/" },
  { name: "Aviva", kind: "bill", match: ["aviva"], url: "https://www.aviva.co.uk/myaviva/" },
  { name: "Direct Line", kind: "bill", match: ["direct line"], url: "https://www.directline.com/" },
  { name: "Churchill", kind: "bill", match: ["churchill"], url: "https://www.churchill.com/" },
  { name: "LV=", kind: "bill", match: ["liverpool victoria", "lv= ", "lv insurance"], url: "https://www.lv.com/" },
  { name: "Hastings Direct", kind: "bill", match: ["hastings"], url: "https://www.hastingsdirect.com/" },
  { name: "RAC", kind: "bill", match: ["rac "], url: "https://www.rac.co.uk/" },
  { name: "AA", kind: "bill", match: ["aa "], url: "https://www.theaa.com/" },
];

function matches(merchant, keyword) {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const end = keyword.endsWith(" ") ? "($|[^a-z])" : "";
  return new RegExp(`(^|[^a-z])${escaped}${end}`).test(merchant);
}

// The known service a merchant is, or null.
export function knownService(merchant) {
  return SERVICES.find((service) => service.match.some((keyword) => matches(merchant, keyword))) ?? null;
}
