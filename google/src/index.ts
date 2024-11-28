import { z } from "zod";
import {
  defineDAINService,
  ToolConfig,
  createOAuth2Tool,
  OAuth2Tokens,
} from "@dainprotocol/service-sdk";

// Store tokens in memory (in production, use a proper database)
const tokenStore = new Map<string, OAuth2Tokens>();

// Tool to send email via Gmail
const sendEmailConfig: ToolConfig = {
  id: "send-gmail",
  name: "Send Gmail",
  description: "Sends an email using authenticated Gmail account",
  input: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  output: z.any(),
  pricing: { pricePerUse: 0.01, currency: "USD" },
  handler: async ({ to, subject, body }, agentInfo, { app }) => {
    const tokens = tokenStore.get(agentInfo.id);

    if (!tokens) {
      const authUrl = await app.oauth2?.generateAuthUrl("google", agentInfo.id);
      return {
        text: "Please authenticate with Google first",
        data: null,
        ui: {
          type: "oauth2",
          uiData: JSON.stringify({
            title: "Google Authentication",
            logo: "https://www.google.com/gmail/about/static-2.0/images/logo-gmail.png",
            content: "Please authenticate with Google to send emails",
            url: authUrl,
            provider: "google",
          }),
        },
      };
    }

    // Create base64 encoded email
    const email = [
      'Content-Type: text/plain; charset="UTF-8"\n',
      'MIME-Version: 1.0\n',
      `To: ${to}\n`,
      `Subject: ${subject}\n\n`,
      body
    ].join('');
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedEmail,
      }),
    });

    const result = await response.json();

    return {
      text: `Email sent successfully`,
      data: {
        messageId: result.id,
      },
      ui: {
        type: "card",
        uiData: JSON.stringify({
          title: "Email Sent",
          content: `To: ${to}\nSubject: ${subject}\nMessage ID: ${result.id}`,
        }),
      },
    };
  },
};

const dainService = defineDAINService({
  metadata: {
    title: "Gmail Send Email Example",
    description: "A DAIN service for sending emails via Gmail",
    version: "1.0.0",
    author: "Your Name",
    tags: ["oauth2", "gmail", "email"],
    logo: "https://www.google.com/gmail/about/static-2.0/images/logo-gmail.png",
  },
  identity: {
    apiKey: process.env.DAIN_API_KEY,
  },
  oauth2: {
    baseUrl: process.env.TUNNEL_URL,
    providers: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/gmail.send"],
        onSuccess: async (agentId, tokens) => {
          console.log("Completed OAuth flow for agent", agentId, tokens);
          tokenStore.set(agentId, tokens);
          console.log(`Stored tokens for agent ${agentId}`);
        },
      },
    },
  },
  tools: [createOAuth2Tool("google"), sendEmailConfig],
});

dainService.startNode({ port: Number(process.env.PORT) || 2022 }).then(() => {
  console.log("OAuth Example Service is running on port " + process.env.PORT || 2022);
});
