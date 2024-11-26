import { z } from "zod";
import {
  defineDAINService,
  ToolConfig,
  createOAuth2Tool,
  OAuth2Tokens,
} from "@dainprotocol/service-sdk";

// Store tokens in memory (in production, use a proper database)
const tokenStore = new Map<string, OAuth2Tokens>();

// Tool to get user profile after OAuth authentication
const getUserProfileConfig: ToolConfig = {
  id: "get-github-profile",
  name: "Get GitHub Profile",
  description: "Fetches the authenticated user's GitHub profile",
  input: z.object({}),
  output: z.any(),
  pricing: { pricePerUse: 0.01, currency: "USD" },
  handler: async ({}, agentInfo, { app }) => {
    const tokens = tokenStore.get(agentInfo.id);

    if (!tokens) {
      const authUrl = await app.oauth2?.generateAuthUrl("github", agentInfo.id);
      return {
        text:
        "Please authenticate with GitHub first, i have displayed a component to authenticate with GitHub",
        data: null,
        ui: {
          type: "oauth2",
          uiData: JSON.stringify({
            title: "GitHub Authentication",
            logo: "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png",
            content: "Please authenticate with GitHub to continue",
            url: authUrl,
            provider: "github",
          }),
        },
      };
    }

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/json",
      },
    });

    const profile = await response.json();

    return {
      text: `Retrieved GitHub profile for ${profile.login}`,
      data: {
        login: profile.login,
        name: profile.name,
        email: profile.email,
        bio: profile.bio,
        public_repos: profile.public_repos,
      },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: "GitHub Profile",
          content: `Login: ${profile.login}\nName: ${profile.name}\nEmail: ${profile.email}\nBio: ${profile.bio}\nPublic Repos: ${profile.public_repos}`,
        }),
      },
    };
  },
};

const createGistConfig: ToolConfig = {
  id: "create-github-gist",
  name: "Create GitHub Gist",
  description: "Creates a new GitHub Gist with the provided content",
  input: z.object({
    description: z.string(),
    public: z.boolean().default(true),
    filename: z.string(),
    content: z.string(),
  }),
  output: z.any(),
  pricing: { pricePerUse: 0.01, currency: "USD" },
  handler: async (
    { description, public: isPublic, filename, content },
    agentInfo,
    { app }
  ) => {
    const tokens = tokenStore.get(agentInfo.id);

    if (!tokens) {
      const authUrl = await app.oauth2?.generateAuthUrl("github", agentInfo.id);
      return {
        text:
          "Please authenticate with GitHub first, i have displayed a component to authenticate with GitHub",
        data: null,
        ui: {
            type: "oauth2",
            uiData: JSON.stringify({
              title: "GitHub Authentication",
              logo: "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png",
              content: "Please authenticate with GitHub to continue",
              url: authUrl,
              provider: "github",
          }),
        },
      };
    }

    const response = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description,
        public: isPublic,
        files: {
          [filename]: {
            content,
          },
        },
      }),
    });

    const gist = await response.json();

    return {
      text: `Created Gist: ${gist.html_url}`,
      data: {
        html_url: gist.html_url,
        id: gist.id,
      },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: "GitHub Gist",
          content: `URL: ${gist.html_url}\nID: ${gist.id}`,
          buttonText: "View Gist",
          buttonUrl: gist.html_url,
        }),
      },
    };
  },
};

const dainService = defineDAINService({
  metadata: {
    title: "GitHub OAuth Example",
    description:
      "A DAIN service demonstrating OAuth2 authentication with GitHub",
    version: "1.0.0",
    author: "Your Name",
    tags: ["oauth2", "github", "authentication"],
    logo: "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png",
  },
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  oauth2: {
    baseUrl: process.env.TUNNEL_URL,
    providers: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        authorizationUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: ["user", "user:email", "gist"],
        // Store tokens when OAuth flow completes
        onSuccess: async (agentId, tokens) => {
          console.log("Completed OAuth flow for agent", agentId, tokens);
          tokenStore.set(agentId, tokens); // in production, use a proper database
          console.log(`Stored tokens for agent ${agentId}`);
        },
      },
    },
  },
  // Combine the OAuth2 login tool with our profile tool
  tools: [createOAuth2Tool("github"), getUserProfileConfig, createGistConfig],
});

dainService.startNode({ port: Number(process.env.PORT) || 2022 }).then(() => {
  console.log("OAuth Example Service is running on port " + process.env.PORT || 2022);
});
