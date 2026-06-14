// JoBoss feature:
// - F-01: User Registration & Authentication

// Official install path: run infrastructure/setup_all.py — it writes frontend/.env with all values.
// Fallback values below are for existing local dev only and must not be used on a clean account.
const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID || "us-east-1_a8enAwcyl",
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || "5o1mg9dtkh7kjuvqu145oafv00",
      loginWith: {
        email: true,
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || "joboss.auth.us-east-1.amazoncognito.com",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [
            import.meta.env.VITE_CLOUDFRONT_URL || "https://d231wno34rvped.cloudfront.net",
            "http://localhost:5173"
          ],
          redirectSignOut: [
            import.meta.env.VITE_CLOUDFRONT_URL || "https://d231wno34rvped.cloudfront.net",
            "http://localhost:5173"
          ],
          responseType: "code"
        }
      }
    }
  }
};

export default awsConfig;
