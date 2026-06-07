const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      loginWith: {
        email: true,
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || "",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [
            import.meta.env.VITE_CLOUDFRONT_URL || "http://localhost:5173",
            "http://localhost:5173"
          ],
          redirectSignOut: [
            import.meta.env.VITE_CLOUDFRONT_URL || "http://localhost:5173",
            "http://localhost:5173"
          ],
          responseType: "code"
        }
      }
    }
  }
};

export default awsConfig;
