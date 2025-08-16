const axios = require('axios');

const SMM_API_URL = 'https://cheapestsmmpanels.com/api/v2';
const SMM_API_KEY = '9e76aab997b6f75e1a25825a84fe08fb';

async function smmRequest(action, params = {}) {
    try {
        const postData = { key: SMM_API_KEY, action: action, ...params };
        const response = await axios.post(SMM_API_URL, new URLSearchParams(postData));
        return response.data;
    } catch (error) {
        console.error("SMM Provider Error:", error.message);
        return { error: `API request to provider failed.` };
    }
}

module.exports = { smmRequest };