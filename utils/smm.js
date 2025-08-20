const axios = require("axios");
const { SMM_CONFIG } = require("../config");

async function smmRequest(action, params = {}) {
  try {
    const postData = {
      key: SMM_CONFIG.apiKey,
      action: action,
      ...params,
    };
    const response = await axios.post(
      SMM_CONFIG.apiUrl,
      new URLSearchParams(postData)
    );
    return response.data;
  } catch (error) {
    console.error(`SMM API Request Failed for action "${action}":`, error);
    return { error: `API request to provider failed.` };
  }
}

module.exports = { smmRequest };