const generateReferralCode = (username) => {
    return (
      username.slice(0, 4).toUpperCase() +
      Math.random().toString(36).substring(2, 6).toUpperCase()
    );
  };
  
  module.exports = { generateReferralCode };