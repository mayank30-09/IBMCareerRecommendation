const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userInput: {
      skills: {
        type: [String],
        required: true
      },
      interests: {
        type: [String],
        required: true
      },
      education: {
        type: String,
        required: true,
        trim: true
      },
      experience: {
        type: String,
        trim: true,
        default: ''
      },
      careerGoals: {
        type: String,
        trim: true,
        default: ''
      }
    },
    recommendation: {
      career: {
        type: String,
        required: true,
        trim: true
      },
      confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 100
      },
      reason: {
        type: String,
        required: true,
        trim: true
      },
      recommendedSkills: {
        type: [String],
        required: true
      },
      learningPath: {
        type: [String],
        required: true
      },
      nextStep: {
        type: String,
        required: true,
        trim: true
      }
    },
    metadata: {
      model: {
        type: String,
        default: 'placeholder'
      },
      processingTime: {
        type: Number,
        default: null
      },
      promptVersion: {
        type: String,
        default: 'v1.0'
      },
      finishReason: {
        type: String,
        default: null
      },
      usageMetadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      },
      source: {
        type: String,
        default: 'web'
      }
    }
  },
  {
    timestamps: true
  }
);

// Index for chronological sorting
recommendationSchema.index({ createdAt: -1 });

const Recommendation = mongoose.models.Recommendation || mongoose.model('Recommendation', recommendationSchema);

module.exports = Recommendation;
