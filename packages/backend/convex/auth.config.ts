import type { AuthConfig } from "convex/server";

// Base64-encoded JWKS JSON (generate once, commit this file)
const JWKS_BASE64 =
	"eyJrZXlzIjpbeyJlIjoiQVFBQiIsImt0eSI6IlJTQSIsIm4iOiJ0TDNBRGI3bC13S0tRRE5PTlNDczJHOFZrM3RfQjNVOVliUnYwS3hFREdSV08wWGVUcHBxcE1xaGg5MjF0TDB0NEkxQlQ5dmw5UGNCX1A3c3VzOWYySWQtckhpaWRSRWJWWXZJVk5YSWozYlo4Z0JsRU10SFZnMkJ4MG5xdC13eU56bVdkbVpvYktLSTlPUUFFb3VXRElqWGZQMGFXanNESHk1bjJuY3YtUjVPTU1wTnBqakNNYUZBRlFkRW5UQV90aXRVWVZHcG1wb25HcmRPemRlelBBekRKMzJBaU1UeEgtRzZQdFBfRkhLQi1NSmdzNk5lUDRFVFV1ZWpPWUcza3NEekE3THBZNlA4UFI0dWZqR2hpRUFTdG5YbGVXejJoaUd1bS1IWXFpUEM2Z1dUOUJad0dFQXlFOWpOaEx2aVA0bkVBeGdDTHdEcGhwQ0ltQUVmTnciLCJraWQiOiJvcGVuLXZvdWNoZXIta2V5LTEiLCJhbGciOiJSUzI1NiIsInVzZSI6InNpZyJ9XX0=";
const jwks = `data:application/json;base64,${JWKS_BASE64}`;

export default {
	providers: [
		{
			type: "customJwt",
			applicationID: "open-voucher",
			issuer: "https://www.openvouchers.org",
			jwks,
			algorithm: "RS256",
		},
	],
} satisfies AuthConfig;
