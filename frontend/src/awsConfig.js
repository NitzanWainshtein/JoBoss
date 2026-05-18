const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_a8enAwcyl",
      userPoolClientId: "5o1mg9dtkh7kjuvqu145oafv00",
      loginWith: {
        email: true,
        oauth: {
          domain: "joboss.auth.us-east-1.amazoncognito.com",
          scopes: ["openid", "email", "profile"],
          redirectSignIn: ["https://d231wno34rvped.cloudfront.net", "http://localhost:5173"],
          redirectSignOut: ["https://d231wno34rvped.cloudfront.net", "http://localhost:5173"],
          responseType: "code"
        }
      }
    }
  }
};

export default awsConfig;