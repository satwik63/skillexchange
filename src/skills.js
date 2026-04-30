export const skillOptions = [
  "aws",
  "android",
  "angular",
  "api design",
  "autocad",
  "azure",
  "branding",
  "c",
  "c++",
  "canva",
  "communication",
  "content writing",
  "css",
  "cyber security",
  "data analysis",
  "data structures",
  "django",
  "docker",
  "english",
  "excel",
  "express",
  "figma",
  "firebase",
  "flask",
  "git",
  "graphic design",
  "html",
  "illustrator",
  "java",
  "javascript",
  "machine learning",
  "mern",
  "mongodb",
  "mysql",
  "next.js",
  "node.js",
  "photoshop",
  "power bi",
  "presentation",
  "python",
  "react",
  "react native",
  "sql",
  "tailwind css",
  "typescript",
  "ui ux",
  "video editing",
  "web development",
  "wordpress"
];

export const skillCategories = [
  {
    name: "Coding",
    skills: [
      "android",
      "angular",
      "api design",
      "c",
      "c++",
      "css",
      "data structures",
      "django",
      "express",
      "firebase",
      "flask",
      "html",
      "java",
      "javascript",
      "mern",
      "next.js",
      "node.js",
      "python",
      "react",
      "react native",
      "tailwind css",
      "typescript",
      "web development"
    ]
  },
  {
    name: "Data Science",
    skills: ["data analysis", "excel", "machine learning", "power bi", "sql"]
  },
  {
    name: "AI / Machine Learning",
    skills: ["machine learning", "python", "data analysis"]
  },
  {
    name: "Cyber Security",
    skills: ["cyber security"]
  },
  {
    name: "Cloud / DevOps",
    skills: [
      "aws",
      "azure",
      "docker",
      "git"
    ]
  },
  {
    name: "UI / UX Design",
    skills: ["figma", "ui ux", "canva"]
  },
  {
    name: "Graphic Design",
    skills: ["branding", "graphic design", "illustrator", "photoshop", "canva"]
  },
  {
    name: "Video Editing",
    skills: ["video editing"]
  },
  {
    name: "Languages",
    skills: ["english", "communication", "content writing", "presentation"]
  },
  {
    name: "Business / Marketing",
    skills: ["branding", "content writing", "communication", "presentation", "wordpress"]
  },
  {
    name: "Engineering / CAD",
    skills: ["autocad"]
  },
  {
    name: "Databases",
    skills: [
      "mongodb",
      "mysql",
      "sql"
    ]
  },
  {
    name: "Other",
    skills: []
  }
];

export const categoryOptions = skillCategories.map((category) => category.name);

export function getSkillCategory(skill = "") {
  const normalizedSkill = skill.trim().toLowerCase();

  if (!normalizedSkill) {
    return "";
  }

  const match = skillCategories.find((category) => category.skills.includes(normalizedSkill));
  return match?.name || "Other";
}

export function getSkillsForCategory(categoryName = "") {
  if (!categoryName) {
    return skillOptions;
  }

  const match = skillCategories.find((category) => category.name === categoryName);
  return match?.skills || skillOptions;
}
