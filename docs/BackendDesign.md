# Backend Design Document

**Project Name**: CareerPilot AI  
**Role**: Backend Architect  
**Technology Stack**: Node.js, Express.js, MongoDB, Mongoose, Gemini API

---

## 1. Backend Overview
The CareerPilot AI backend serves as a secure API gateway, orchestrator, and persistence layer between the React Frontend and the Google Gemini API. 

Its primary responsibilities are to:
- Securely accept user career assessment inputs from the **React Frontend**.
- Validate inputs against strict structural schemas.
- Format the input securely using prompt templates and forward the request to the **Gemini API**.
- Validate the generated JSON response from Gemini.
- Persist the user inputs, AI responses, and metadata into **MongoDB**.
- Return the final structured data back to the React frontend in a standardized API response format.
- Manage rate limits, CORS policies, and general system security, ensuring that sensitive API keys are entirely hidden from the client.

---

## 2. Final Backend Folder Structure
The backend is structured around domain-driven design, enforcing strict separation of concerns for maintainability.

```text
careerpilot-ai/backend/
├── src/
│   ├── config/       # Environment variables, database connection setup, logger config
│   ├── constants/    # Hardcoded strings, HTTP status codes, error messages
│   ├── controllers/  # HTTP request/response handlers (pure REST logic)
│   ├── middleware/   # Express middlewares (Error handler, Rate Limiter, CORS, auth)
│   ├── models/       # Mongoose schemas and database models
│   ├── prompts/      # AI prompt templates and prompt builder logic
│   ├── routes/       # Express route definitions mapping URLs to controllers
│   ├── schemas/      # Validation schemas (Joi/Zod) for incoming request bodies
│   ├── services/     # Core business logic (Gemini API calls, database operations)
│   ├── utils/        # Reusable helper functions (JSON parsing, formatting)
│   └── app.js        # Express application setup and middleware registration
└── server.js         # Entry point: Server initialization and database connection
```

---

## 3. Request Lifecycle
The backend processes every incoming request through a strict unidirectional lifecycle:

**User Request**
↓
**Route** (Maps URL to Controller)
↓
**Validation** (Middleware checks `req.body` against `schemas/`)
↓
**Controller** (Extracts valid data and calls Service)
↓
**Service** (Constructs prompt using `prompts/` and communicates with...)
↓
**Gemini API** (Returns unstructured text/JSON)
↓
**Service** (Validates/parses Gemini JSON)
↓
**MongoDB** (Logs the final result asynchronously)
↓
**Controller** (Formats success/error)
↓
**Response** (Standardized JSON payload sent back to User)

---

## 4. API Design

### `POST /api/v1/recommendations`
- **Purpose**: Generates AI career recommendations based on user skills, interests, and education.
- **Request Body**:
  ```json
  {
    "skills": ["JavaScript", "Docker"],
    "interests": ["Cloud Computing"],
    "education": "B.S. Computer Science"
  }
  ```
- **Validation Rules**: `skills` (Array of Strings, required), `interests` (Array of Strings, required), `education` (String, required).
- **Success Response** (200 OK):
  ```json
  {
    "success": true,
    "message": "Recommendations generated successfully",
    "data": {
      "careerRecommendations": [...],
      "skillGap": [...],
      "learningRoadmap": [...],
      "interviewTips": [...]
    }
  }
  ```
- **Possible Errors**: 
  - `400 Bad Request` (Validation Failed)
  - `429 Too Many Requests` (Rate Limited)
  - `503 Service Unavailable` (Gemini API Error)
  - `500 Internal Server Error` (Database/System Error)

### `GET /api/v1/health`
- **Purpose**: Check the health of the Express application and MongoDB connection.
- **Request Body**: None.
- **Validation Rules**: None.
- **Success Response** (200 OK):
  ```json
  {
    "success": true,
    "message": "System is healthy",
    "data": { "status": "up", "db": "connected" }
  }
  ```
- **Possible Errors**: `500 Internal Server Error` (if DB is down).

### Reserved Future Endpoints (Not Implemented in MVP)
- **`GET /api/v1/recommendations/:id`**: Fetch a specific recommendation.
- **`GET /api/v1/history`**: Fetch user recommendation history (Requires Auth).
- **`DELETE /api/v1/history/:id`**: Delete a history record (Requires Auth).
- **`POST /api/v1/users/register`**: Future user registration.
- **`POST /api/v1/users/login`**: Future user login.

---

## 5. Controller Responsibilities

- **Recommendation Controller** (`recommendation.controller.js`): Responsible for handling the `POST /api/v1/recommendations` route. It passes validated `req.body` data to the Recommendation Service, catches any thrown errors (passing them to `next()`), and formats the final HTTP 200 JSON response.
- **Health Controller** (`health.controller.js`): Handles the `/health` endpoint. Pings the DB and returns system status.
- **Future User Controller** (`user.controller.js`): (Reserved) Will handle authentication, JWT generation, and profile management once Auth is introduced.

---

## 6. Service Layer

- **Gemini Service** (`gemini.service.js`): Strictly handles the `@google/generative-ai` SDK integration. Responsible for sending prompts, enforcing structured JSON output configurations, handling Gemini-specific retries, and catching timeout errors.
- **Recommendation Service** (`recommendation.service.js`): The orchestrator of the feature. It receives raw user input, builds the prompt template (via `prompts/`), calls the `Gemini Service`, parses the resulting JSON, and finally hands the structured output to the Logging Service before returning data to the Controller.
- **Logging Service** (`logging.service.js`): Handles saving the input/output payloads to MongoDB via Mongoose. Runs asynchronously so it doesn't block the HTTP response to the client.
- **Future User Service** (`user.service.js`): (Reserved) Will handle password hashing, JWT signing, and user DB lookups.

---

## 7. Database Design
Uses MongoDB with Mongoose ODM for strict schema enforcement.

### Collection: `Recommendations`
- **Fields**:
  - `_id`: ObjectId (Primary Key)
  - `userInput`: Object
    - `skills`: `[String]`
    - `interests`: `[String]`
    - `education`: `String`
  - `aiResponse`: Object (Unstructured JSON or strict nested schemas matching the AI Output)
  - `processingTime`: `Number` (Milliseconds)
  - `model`: `String` (e.g., "gemini-2.5-flash")
  - `createdAt`: `Date` (default `Date.now`)
- **Indexes**: `createdAt` (-1) for faster chronologic sorting.
- **Schema Validation**: Mongoose `required: true` properties on `userInput` and `aiResponse`.
- **Relationships**: None for MVP.
- **Future Collections**: `Users` collection. The `Recommendations` collection will gain a `userId` field (Indexed, Ref: 'User') to establish a One-to-Many relationship.

---

## 8. Validation Strategy
Validation is handled at the routing layer using schemas (e.g., Zod or Joi) to reject bad payloads before they hit the controller.

**Validation Rules for `/recommendations`**:
- **`skills`**: Array of Strings. Required. Min length: 1 item. Max length: 20 items. Each string max length: 50 characters.
- **`interests`**: Array of Strings. Required. Min length: 1 item. Max length: 20 items. Each string max length: 50 characters.
- **`education`**: String. Required. Min length: 5 chars. Max length: 100 chars.
- **Input Sanitization**: Strings will be trimmed of leading/trailing whitespace. HTML/script tags will be neutralized by the validation library to prevent prompt injection or XSS.

---

## 9. Gemini Integration

- **Prompt Builder**: A dedicated module (`prompts/recommendation.prompt.js`) that injects user `skills`, `interests`, and `education` into a highly restrictive system prompt instructing the AI to act as a career advisor.
- **JSON Schema**: The prompt explicitly enforces that Gemini must return a raw, valid JSON object matching the exact keys required by the frontend (`careerRecommendations`, `skillGap`, etc.) without markdown code blocks (` ```json `).
- **Response Validation**: The Service layer executes `JSON.parse()` on the output. If it fails, it throws a custom `AiParsingError`.
- **Retry Strategy**: If parsing fails or the AI returns a malformed response, the Gemini Service will execute exactly **1 automated retry** before failing.
- **Timeout**: The API call is wrapped in a `Promise.race()` or `AbortController` set to `15000ms` (15 seconds) to prevent infinite hanging.
- **Error Handling**: Timeout errors or API quota limits translate to HTTP `503 Service Unavailable`.

---

## 10. Middleware Design

- **Error Handler** (`errorHandler.middleware.js`): A global Express error middleware (`app.use((err, req, res, next)`) that catches all unhandled exceptions, determines the status code, and outputs a sanitized JSON response (hiding stack traces in production).
- **404 Handler** (`notFound.middleware.js`): Catches requests to non-existent endpoints and returns a standard 404 JSON response.
- **Rate Limiter** (`rateLimiter.middleware.js`): Uses `express-rate-limit` on the `/recommendations` POST route (e.g., max 5 requests per minute per IP) to prevent spam and AI quota exhaustion.
- **CORS** (`cors.middleware.js`): Configured to only accept requests from the `CLIENT_URL` defined in the environment variables.
- **Helmet**: Secures Express apps by setting various HTTP headers (XSS filter, no-sniff, frameguard).
- **Request Logger**: Uses `morgan` to log incoming HTTP requests to the console for observability.
- **Validation Middleware**: A generic middleware that accepts a schema (Zod/Joi) and validates `req.body`, throwing a `400 Bad Request` on failure.

---

## 11. Error Response Format
All errors returned by the API will follow a consistent, predictable structure.

**Example Format**:
```json
{
  "success": false,
  "message": "Validation Failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": ["'skills' must contain at least 1 item"]
  }
}
```

---

## 12. Environment Variables
The following environment variables drive the backend configuration:

- `PORT` (e.g., 5000)
- `NODE_ENV` (development | production)
- `CLIENT_URL` (e.g., http://localhost:5173 - for CORS)
- `MONGODB_URI` (MongoDB connection string)
- `GEMINI_API_KEY` (Secret key for Google Gemini)
- `GEMINI_MODEL` (e.g., gemini-2.5-flash)
- `REQUEST_TIMEOUT` (e.g., 15000)
- `RATE_LIMIT_WINDOW` (e.g., 60000)
- `RATE_LIMIT_MAX` (e.g., 5)

---

## 13. Security Design

- **API Key Security**: `GEMINI_API_KEY` is completely isolated in the backend `.env` file and is never exposed to the frontend or source control.
- **Environment Variables**: Managed via `dotenv` and validated on startup. The server crashes immediately if required variables are missing.
- **Rate Limiting**: Applied strictly to costly endpoints (Gemini API) to prevent Denial of Wallet (DoW) attacks.
- **Prompt Injection Prevention**: Strict character limits on user inputs. The prompt template encapsulates user input inside distinct quotation blocks to minimize the risk of overriding system instructions.
- **NoSQL Injection Prevention**: Mongoose inherently sanitizes queries, preventing injection attacks. Payload validation strictly enforces types.
- **Input Sanitization**: Handled by the validation schema layer (stripping unexpected fields and trimming inputs).

---

## 14. Logging Strategy

- **Request Logging**: `morgan` middleware logs every incoming API request method, URL, and response time.
- **Error Logging**: Uses `winston` or `pino` to log error stack traces and request payloads when a 500 status occurs.
- **Gemini Logging**: The specific inputs sent to Gemini and the raw outputs received are logged asynchronously to the MongoDB `Recommendations` collection for quality assurance and debugging.
- **Performance Logging**: The time taken for Gemini to process the request is tracked and saved to the database (`processingTime` field).

---

## 15. Testing Strategy

- **Unit Testing**: Jest will be used to test utility functions, prompt generation logic, and JSON parsing logic.
- **API Testing**: Supertest will be used alongside Jest to test Express routes, validation middlewares, and error handlers using mocked service layers.
- **Integration Testing**: Testing the connection between the Service layer and a test MongoDB instance.
- **Manual Testing**: Postman or ThunderClient collections will be maintained to manually trigger the `/recommendations` API with various payloads to verify end-to-end functionality.

---

## 16. Future Scalability
The backend is fundamentally designed to expand gracefully post-MVP:

- **Authentication & JWT**: A `Users` collection and authentication middleware can be introduced without breaking the core recommendation logic. The API will use JWT tokens in the `Authorization` header.
- **History**: By associating `userId` with the `Recommendations` model, we easily unlock a `GET /history` endpoint querying `Recommendations.find({ userId })`.
- **Resume Upload**: A new endpoint `POST /upload` can be added using `multer` to handle PDFs, stream them to AWS S3, extract the text, and pipe it directly into the Gemini prompt builder.
- **Admin Dashboard**: We can introduce role-based access control (RBAC). A middleware `isAdmin` can protect new reporting endpoints aggregating MongoDB data.
- **Notifications**: The service layer can easily trigger external APIs (like SendGrid or AWS SNS) after successful DB saves to notify users asynchronously.
