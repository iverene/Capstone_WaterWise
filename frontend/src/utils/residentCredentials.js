// Predefined sign-in password for newly registered residents.
//
// The district office registers the resident and hands over these credentials
// in person. The consumer portal then walks the resident through first-login
// onboarding, where the password can be replaced.
//
// Keep this value compatible with every rule that validates it:
//   - frontend/src/components/ConsumerForm.jsx  (isStrongPassword)
//   - backend/models/consumerModels.js          (validator.isStrongPassword)
// That means at least 8 characters with uppercase, lowercase, a number, and a
// symbol.
export const DEFAULT_RESIDENT_PASSWORD = "WaterWise@123";
