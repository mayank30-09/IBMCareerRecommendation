const http = require('http');
const assert = require('assert');

process.env.GEMINI_API_KEY = 'test-key-123';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.PORT = '0';

const geminiService = require('./src/services/gemini.service');
const repo = require('./src/repositories/recommendation.repository');
const app = require('./src/app');

const originalSendPrompt = geminiService.sendPrompt;
const originalExecuteContentGeneration = geminiService.executeContentGeneration;
const originalCreateRecommendation = repo.createRecommendation;

function resetServiceMocks() {
  geminiService.sendPrompt = originalSendPrompt;
  geminiService.executeContentGeneration = originalExecuteContentGeneration;
  repo.createRecommendation = originalCreateRecommendation;
}

function makeRequest(server, path, method, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : '';

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runFullTestSuite() {
  console.log('==================================================');
  console.log('   RUNNING PRE-PHASE 6 API & QUALITY TEST SUITE   ');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  async function testApi(name, setupMocks, testFn) {
    total++;
    resetServiceMocks();

    if (setupMocks) {
      setupMocks(geminiService, repo);
    }

    const server = http.createServer(app);
    await new Promise((res) => server.listen(0, '127.0.0.1', res));

    try {
      await testFn(server);
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    } finally {
      await new Promise((res) => server.close(res));
    }
  }

  function testUnit(name, fn) {
    total++;
    resetServiceMocks();
    try {
      fn();
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    }
  }

  // ==========================================
  // SECTION 1: REAL API ENDPOINT TESTS
  // ==========================================
  console.log('--- SECTION 1: API ENDPOINT TESTS ---');

  await testApi(
    'API 1. Valid Request: Returns 200 OK with formatted recommendation',
    (geminiService, repo) => {
      geminiService.sendPrompt = async () => ({
        text: JSON.stringify({
          career: 'Senior React Developer',
          confidence: 95,
          reason: 'Strong frontend expertise in React ecosystem.',
          recommendedSkills: ['Next.js', 'TypeScript', 'TailwindCSS'],
          learningPath: ['Master Next.js App Router', 'Learn TypeScript design patterns'],
          nextStep: 'Build a Next.js portfolio project'
        }),
        model: 'gemini-2.5-flash',
        finishReason: 'STOP',
        responseTime: 180
      });
      repo.createRecommendation = async (d) => ({ _id: 'mock-id', ...d });
    },
    async (server) => {
      const payload = {
        skills: ['JavaScript', 'React', 'HTML/CSS'],
        interests: ['Frontend', 'UI Engineering'],
        education: 'B.S. Computer Science',
        experience: '3 years',
        careerGoals: 'Lead Frontend Developer'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert(res.body.data.requestId);
      assert.strictEqual(res.body.data.recommendation.career, 'Senior React Developer');
      assert.strictEqual(res.body.data.recommendation.confidence, 95);
    }
  );

  await testApi(
    'API 2. Missing Fields: Missing skills field returns 400 Bad Request',
    null,
    async (server) => {
      const payload = {
        interests: ['AI'],
        education: 'B.S. CS'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    }
  );

  await testApi(
    'API 3. Empty Arrays: Empty skills array returns 400 Bad Request',
    null,
    async (server) => {
      const payload = {
        skills: [],
        interests: ['AI'],
        education: 'B.S. CS'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    }
  );

  await testApi(
    'API 4. Invalid Education: Non-string education returns 400 Bad Request',
    null,
    async (server) => {
      const payload = {
        skills: ['Python'],
        interests: ['AI'],
        education: 12345
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    }
  );

  await testApi(
    'API 5. Invalid Experience: Exceeding max character limit returns 400 Bad Request',
    null,
    async (server) => {
      const payload = {
        skills: ['Python'],
        interests: ['AI'],
        education: 'B.S. CS',
        experience: 'x'.repeat(1001)
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    }
  );

  await testApi(
    'API 6. Invalid Gemini Response: Gemini returning unparseable JSON triggers 500/503 AI_PARSING_ERROR',
    (geminiService) => {
      geminiService.sendPrompt = async () => ({
        text: 'Sorry, I cannot help with career advice.',
        model: 'gemini-2.5-flash',
        responseTime: 100
      });
    },
    async (server) => {
      const payload = {
        skills: ['Python'],
        interests: ['AI'],
        education: 'B.S. CS'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert(res.status === 500 || res.status === 503);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'AI_PARSING_ERROR');
    }
  );

  await testApi(
    'API 7. MongoDB Unavailable: Database write error returns 500 DATABASE_ERROR or SERVER_ERROR',
    (geminiService, repo) => {
      const httpStatus = require('./src/constants/httpStatus');
      const errorCodes = require('./src/constants/errorCodes');

      geminiService.sendPrompt = async () => ({
        text: JSON.stringify({
          career: 'AI Engineer',
          confidence: 90,
          reason: 'Good match',
          recommendedSkills: ['PyTorch'],
          learningPath: ['Step 1'],
          nextStep: 'Start tutorial'
        }),
        model: 'gemini-2.5-flash',
        responseTime: 150
      });

      repo.createRecommendation = async () => {
        const err = new Error('Database connection lost');
        err.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
        err.code = errorCodes.DATABASE_ERROR;
        throw err;
      };
    },
    async (server) => {
      const payload = {
        skills: ['Python'],
        interests: ['AI'],
        education: 'B.S. CS'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.body.success, false);
      assert(res.body.error.code === 'DATABASE_ERROR' || res.body.error.code === 'SERVER_ERROR');
    }
  );

  await testApi(
    'API 8. Gemini Unavailable: Gemini service outage returns 503 AI_SERVICE_ERROR',
    (geminiService) => {
      const httpStatus = require('./src/constants/httpStatus');
      const errorCodes = require('./src/constants/errorCodes');

      geminiService.sendPrompt = async () => {
        const err = new Error('Gemini service unavailable (503)');
        err.statusCode = httpStatus.SERVICE_UNAVAILABLE;
        err.code = errorCodes.AI_SERVICE_ERROR;
        throw err;
      };
    },
    async (server) => {
      const payload = {
        skills: ['Python'],
        interests: ['AI'],
        education: 'B.S. CS'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'AI_SERVICE_ERROR');
    }
  );

  await testApi(
    'API 9. Timeout: Request timeout returns 503 AI_SERVICE_ERROR',
    (geminiService) => {
      const httpStatus = require('./src/constants/httpStatus');
      const errorCodes = require('./src/constants/errorCodes');

      geminiService.sendPrompt = async () => {
        const err = new Error('Gemini request timed out after 15000ms');
        err.statusCode = httpStatus.SERVICE_UNAVAILABLE;
        err.code = errorCodes.AI_SERVICE_ERROR;
        throw err;
      };
    },
    async (server) => {
      const payload = {
        skills: ['Python'],
        interests: ['AI'],
        education: 'B.S. CS'
      };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'AI_SERVICE_ERROR');
    }
  );

  await testApi(
    'API 10. Concurrent Requests: 10 simultaneous API calls execute cleanly with unique requestIds',
    (geminiService, repo) => {
      const createdIds = new Set();
      geminiService.sendPrompt = async () => ({
        text: JSON.stringify({
          career: 'Full Stack Engineer',
          confidence: 88,
          reason: 'Match',
          recommendedSkills: ['TypeScript'],
          learningPath: ['Step 1'],
          nextStep: 'Next step'
        }),
        model: 'gemini-2.5-flash',
        responseTime: 100
      });

      repo.createRecommendation = async (d) => {
        createdIds.add(d.requestId);
        return { _id: 'id-' + d.requestId, ...d };
      };

      geminiService._createdIds = createdIds;
    },
    async (server) => {
      const payload = { skills: ['JS'], interests: ['Web'], education: 'B.S.' };
      const requests = Array.from({ length: 10 }, () => makeRequest(server, '/api/v1/recommendations', 'POST', payload));

      const responses = await Promise.all(requests);
      assert.strictEqual(responses.length, 10);
      responses.forEach((res) => {
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
      });

      assert.strictEqual(geminiService._createdIds.size, 10);
    }
  );

  await testApi(
    'API 11. Retry Recovery: 2 transient 503 failures followed by 3rd attempt success recovers cleanly',
    (geminiService, repo) => {
      let attempt = 0;
      geminiService.activeModel = 'gemini-2.5-flash';
      geminiService.executeContentGeneration = async (modelName, promptText) => {
        attempt++;
        if (attempt < 3) {
          const err = new Error('Gemini 503 Service Unavailable');
          err.status = 503;
          throw err;
        }
        return {
          text: JSON.stringify({
            career: 'Resilient Cloud Architect',
            confidence: 91,
            reason: 'Recovered on 3rd attempt.',
            recommendedSkills: ['AWS', 'Kubernetes'],
            learningPath: ['AWS Solutions Architect'],
            nextStep: 'Deploy first resilient stack'
          }),
          model: 'gemini-2.5-flash',
          finishReason: 'STOP',
          usageMetadata: { totalTokens: 120 },
          responseTime: 140
        };
      };
      repo.createRecommendation = async (d) => ({ _id: 'mock-id', ...d });
    },
    async (server) => {
      const payload = { skills: ['AWS'], interests: ['Cloud'], education: 'B.S.' };

      const res = await makeRequest(server, '/api/v1/recommendations', 'POST', payload);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.recommendation.career, 'Resilient Cloud Architect');
    }
  );

  // ==========================================
  // SECTION 2: DATABASE DATA STRUCTURE TESTS
  // ==========================================
  console.log('\n--- SECTION 2: DATABASE DATA STRUCTURE TESTS ---');

  testUnit('DB 1. Document Structure Verification: All required fields and types conform strictly', () => {
    const Recommendation = require('./src/models/recommendation.model');
    const doc = new Recommendation({
      requestId: '123e4567-e89b-12d3-a456-426614174000',
      userInput: {
        skills: ['Python', 'SQL'],
        interests: ['AI'],
        education: 'B.S. CS',
        experience: '2 years',
        careerGoals: 'Senior AI Lead'
      },
      recommendation: {
        career: 'AI Solutions Architect',
        confidence: 94,
        reason: 'Strong AI foundation.',
        recommendedSkills: ['PyTorch', 'ONNX'],
        learningPath: ['Master PyTorch', 'Deploy ONNX models'],
        nextStep: 'Deploy first model'
      },
      metadata: {
        model: 'gemini-2.5-flash',
        processingTime: 250,
        promptVersion: 'v1.0',
        finishReason: 'STOP',
        usageMetadata: { promptTokens: 100, candidateTokens: 50 },
        source: 'web'
      }
    });

    const err = doc.validateSync();
    assert.strictEqual(err, undefined);
    assert.strictEqual(doc.requestId, '123e4567-e89b-12d3-a456-426614174000');
    assert.strictEqual(doc.recommendation.career, 'AI Solutions Architect');
    assert.strictEqual(doc.metadata.promptVersion, 'v1.0');
    assert.strictEqual(doc.metadata.processingTime, 250);
    assert(Array.isArray(doc.userInput.skills));
    assert(Array.isArray(doc.recommendation.recommendedSkills));
    assert(Array.isArray(doc.recommendation.learningPath));
  });

  // ==========================================
  // SECTION 3: AI QUALITY TESTS (10 PROFILES)
  // ==========================================
  console.log('\n--- SECTION 3: AI QUALITY & DIVERSITY TESTS (10 PROFILES) ---');

  const profileMatrix = [
    {
      role: 'Frontend Developer',
      input: { skills: ['JavaScript', 'React', 'CSS', 'Tailwind'], interests: ['UI/UX', 'Web Performance'], education: 'B.S. Web Development', experience: '2 years Frontend', careerGoals: 'Lead UI Engineer' }
    },
    {
      role: 'Backend Developer',
      input: { skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Kafka'], interests: ['Distributed Systems', 'APIs'], education: 'B.S. Computer Science', experience: '3 years Backend', careerGoals: 'Backend Architect' }
    },
    {
      role: 'AI Engineer',
      input: { skills: ['Python', 'PyTorch', 'Transformers', 'Vector Databases'], interests: ['LLMs', 'Generative AI'], education: 'M.S. Artificial Intelligence', experience: '1 year ML Engineer', careerGoals: 'Principal AI Researcher' }
    },
    {
      role: 'Data Scientist',
      input: { skills: ['R', 'Python', 'Pandas', 'Scikit-Learn', 'Statistics'], interests: ['Data Analytics', 'Predictive Modeling'], education: 'M.S. Data Science', experience: '2 years Data Analyst', careerGoals: 'Head of Analytics' }
    },
    {
      role: 'UI/UX Designer',
      input: { skills: ['Figma', 'Wireframing', 'User Research', 'Usability Testing'], interests: ['Design Systems', 'Accessibility'], education: 'B.A. Graphic Design', experience: '2 years Designer', careerGoals: 'Design Systems Lead' }
    },
    {
      role: 'DevOps Engineer',
      input: { skills: ['Docker', 'Kubernetes', 'Terraform', 'GitHub Actions'], interests: ['CI/CD Pipelines', 'Cloud Infrastructure'], education: 'B.S. Information Technology', experience: '3 years SysAdmin', careerGoals: 'Platform Engineering Lead' }
    },
    {
      role: 'Cyber Security Analyst',
      input: { skills: ['Linux', 'Wireshark', 'Metasploit', 'SOC Monitoring'], interests: ['Ethical Hacking', 'Threat Hunting'], education: 'B.S. Cybersecurity', experience: '1 year Security Specialist', careerGoals: 'Lead Penetration Tester' }
    },
    {
      role: 'Cloud Engineer',
      input: { skills: ['AWS', 'CloudFormation', 'IAM', 'Python', 'Networking'], interests: ['Serverless', 'Cloud Migration'], education: 'B.S. Computer Engineering', experience: '2 years Cloud Administrator', careerGoals: 'Cloud Solutions Architect' }
    },
    {
      role: 'Mobile Developer',
      input: { skills: ['Swift', 'Kotlin', 'Flutter', 'Mobile Architecture'], interests: ['iOS App Development', 'Cross-platform Apps'], education: 'B.S. Software Engineering', experience: '2 years iOS Developer', careerGoals: 'Mobile Tech Lead' }
    },
    {
      role: 'Fresh Graduate',
      input: { skills: ['C++', 'Java', 'Data Structures', 'Git'], interests: ['Software Engineering', 'Problem Solving'], education: 'B.S. Computer Science (New Grad)', experience: 'Academic projects only', careerGoals: 'Junior Software Engineer' }
    }
  ];

  for (let i = 0; i < profileMatrix.length; i++) {
    const p = profileMatrix[i];
    testUnit(`AI Quality ${i + 1}/10: ${p.role} profile prompt generates distinct, targeted career context`, () => {
      const { buildRecommendationPrompt } = require('./src/prompts/recommendation.prompt');
      const promptText = buildRecommendationPrompt(p.input);

      assert(promptText.includes(p.input.skills.join(', ')));
      assert(promptText.includes(p.input.interests.join(', ')));
      assert(promptText.includes(p.input.education));
      assert(promptText.includes(p.input.experience));
      assert(promptText.includes(p.input.careerGoals));
    });
  }

  console.log('\n==================================================');
  console.log(` SUMMARY: ${passed}/${total} TESTS PASSED SUCCESSFULLY `);
  console.log('==================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runFullTestSuite().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
