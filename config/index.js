require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  YOUR_FRONTEND_URL: process.env.FRONTEND_URL,

  SMM_CONFIG: {
    apiUrl: process.env.SMM_API_URL,
    apiKey: process.env.SMM_API_KEY,
  },

  LINK_SHORTENER_APIS: {
    adrinolinks: {
      apiUrl: process.env.ADRINOLINKS_API_URL,
      apiKey: process.env.ADRINOLINKS_API_KEY,
    },
    shrinkearn: {
      apiUrl: process.env.SHRINKEARN_API_URL,
      apiKey: process.env.SHRINKEARN_API_KEY,
    },
    gplinks: {
      apiUrl: process.env.GPLINKS_API_URL,
      apiKey: process.env.GPLINKS_API_KEY,
    },
    shrinkme: {
      apiUrl: process.env.SHRINKME_API_URL,
      apiKey: process.env.SHRINKME_API_KEY,
    },
    shrinkforearn: {
      apiUrl: process.env.SHRINKFOREARN_API_URL,
      apiKey: process.env.SHRINKFOREARN_API_KEY,
    },
    clicksfly: {
      apiUrl: process.env.CKICKSFLY_API_URL,
      apiKey: process.env.CKICKSFLY_API_KEY,
    },
    linkpays: {
      apiUrl: process.env.LINKPAYS_API_URL,
      apiKey: process.env.LINKPAYS_API_KEY,
    },
    earn4link: {
      apiUrl: process.env.EARN4LINK_API_URL,
      apiKey: process.env.EARN4LINK_API_KEY,
    },
  },
};