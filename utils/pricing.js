// (Code is identical to the one provided in the previous response)
const PLATFORM_KEYWORDS = {
    Instagram: ["instagram", "ig"],
    YouTube: ["youtube", "yt"],
    TikTok: ["tiktok", "tik tok"],
    Telegram: ["telegram"],
    Facebook: ["facebook", "fb"],
    Spotify: ["spotify"],
  };
  
  const SUB_CATEGORY_KEYWORDS = {
    Followers: ["follower", "subscriber"],
    Likes: ["like"],
    Views: ["view", "play"],
    Comments: ["comment"],
    Shares: ["share", "repost"],
    Reach: ["reach"],
    Other: [],
  };
  
  const getServicePlatform = (serviceCategory) => {
    if (!serviceCategory) return null;
    const categoryLower = serviceCategory.toLowerCase();
    for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
      if (keywords.some((keyword) => categoryLower.includes(keyword))) {
        return platform;
      }
    }
    return null;
  };
  
  const getServiceSubCategory = (serviceName) => {
    if (!serviceName) return "Other";
    const nameLower = serviceName.toLowerCase();
    for (const [subCategory, keywords] of Object.entries(SUB_CATEGORY_KEYWORDS)) {
      if (keywords.some((keyword) => nameLower.includes(keyword))) {
        return subCategory;
      }
    }
    return "Other";
  };
  
  const applyMarkup = (originalRate, rule) => {
    const rate = parseFloat(originalRate);
    if (!rule) {
      return rate * 1; // Default markup
    }
    const value = parseFloat(rule.value);
    if (rule.type === "percent") {
      return rate * (1 + value / 100);
    }
    if (rule.type === "fixed") {
      return rate + value;
    }
    return rate;
  };
  
  module.exports = {
    getServicePlatform,
    getServiceSubCategory,
    applyMarkup,
  };