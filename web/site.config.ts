// Single list of analysis pages: drives the build inputs, the home page cards and the page headers.
export interface PageInfo {
  slug: string;
  title: string;
  description: string;
}

export const SITE_NAME = "Even More Statistics";

export const PAGES: PageInfo[] = [
  {
    slug: "competitions",
    title: "Competitions per year",
    description: "How many WCA competitions took place each year, worldwide and per continent.",
  },
  {
    slug: "competitors",
    title: "Competitors per year",
    description: "Distinct competitors per year and event, and how many people competed for the first time.",
  },
  {
    slug: "pb-distribution",
    title: "Personal best distribution",
    description: "Where a personal best places among all competitors, for every event, single and average.",
  },
  {
    slug: "top-cutoffs",
    title: "Top 10 and top 100 over time",
    description: "The result needed for the top 10 and top 100 at the end of each year, per event and region.",
  },
  {
    slug: "rankings",
    title: "Rankings",
    description: "Top 20 competitors in unusual categories, worldwide, per continent and per country.",
  },
  {
    slug: "progression",
    title: "Competitor progression",
    description: "Every result and the personal best line of one competitor in one event.",
  },
];
