# 📄 System Design Document  
## Digital Signature Certificate (DSC) Signing System

**Project:** DSC-in-Node  
**Version:** 2.0  
**Last Updated:** April 2026  
**Status:** Production-Ready (JWT + Local Agent Architecture)

---

## 1. Introduction

This document describes the system design for a secure Digital Signature Certificate (DSC) based document signing solution. The system enables legally compliant digital signing of PDF documents using USB-based DSC tokens while integrating with modern web applications.

The architecture is designed to bridge browser limitations and hardware-based cryptographic operations using a local signing agent, ensuring that private keys remain secure while enabling scalable and secure backend processing.

---

## 2. Objectives

- Enable secure PDF signing using USB DSC tokens  
- Ensure private keys never leave hardware devices  
- Implement secure request authorization  
- Support legal compliance (PKCS#7 + TSA)  
- Maintain scalability and separation of concerns  
- Prevent unauthorized access to local services  

---

## 3. High-Level Architecture

Frontend (HTTPS - Angular)  
        ↓  
Production Backend (Auth + JWT + Storage)  
        ↓  
Frontend  
        ↓  
Local Backend (localhost Signing Agent)  
        ↓  
Frontend  
        ↓  
Production Backend (Verification + Audit)  

---

## 4. Trust Model

| Component        | Trust Level        |
|----------------|------------------|
| Frontend        | ❌ Untrusted      |
| Local Backend   | ⚠️ Semi-trusted   |
| Prod Backend    | ✅ Trusted        |

---

## 5. System Flow

### 5.1 Authorization Phase

1. User initiates signing from frontend  
2. Frontend sends request to production backend  
3. Backend:
   - Authenticates user  
   - Validates permissions  
   - Generates short-lived JWT  

Example JWT payload:
{
  "action": "sign",
  "fileHash": "SHA256(pdf)",
  "userId": "user123",
  "exp": 60,
  "kid": "key-2026-01"
}

4. Backend returns JWT to frontend  

---

### 5.2 Local Signing Phase

5. Frontend calls local backend (http://localhost)  
   Sends:
   - PDF  
   - PIN  
   - JWT  

6. Local backend:
   - Verifies JWT using public key  
   - Validates signature, expiry, action, file hash  

7. Performs signing:
   - SHA-256 hashing  
   - RSA signing (USB token via PKCS#11)  
   - TSA timestamp request (RFC 3161)  
   - PKCS#7/CMS signature generation  

8. Returns signed PDF to frontend  

---

### 5.3 Backend Verification Phase

9. Frontend sends signed PDF to production backend  
10. Backend:
   - Verifies PKCS#7 signature  
   - Validates certificate chain  
   - Validates TSA timestamp  
   - Recomputes hash  
   - Stores document and audit logs  

11. Returns final response  

---

## 6. Public Key Management

### 6.1 Key Fetch

Local backend fetches keys on startup:

GET /auth/public-keys

Response:
{
  "keys": [
    {
      "kid": "key-2026-01",
      "publicKey": "-----BEGIN PUBLIC KEY-----..."
    }
  ]
}

---

### 6.2 Key Usage

- JWT contains kid  
- Local backend selects matching public key  
- Verifies token  

---

### 6.3 Key Rotation

- Backend rotates keys periodically  
- Local backend refreshes keys automatically  
- No manual update required  

---

## 7. Components

### Frontend (Angular)
- User interface  
- Requests JWT  
- Sends signing requests  
- Displays results  

### Local Backend (DSC Agent)
- Runs on localhost  
- Verifies JWT  
- Interacts with USB token  
- Performs cryptographic operations  

### Production Backend
- Authentication  
- JWT issuance  
- Signature verification  
- Audit logging  
- Data storage  

---

## 8. Security Architecture

### 8.1 Authorization (JWT-Based)
- Backend signs JWT using private key  
- Local backend verifies using public key  

Benefits:
- Prevents unauthorized access  
- Blocks Postman/curl attacks  
- Prevents replay attacks  
- Binds request to file  

---

### 8.2 Cryptographic Security
- SHA-256 hashing  
- RSA signing via USB token  
- PKCS#7/CMS signature format  
- RFC 3161 Timestamp Authority  

---

### 8.3 Zero Trust Model
- Frontend is not trusted  
- Local backend validates all requests  
- Backend re-validates all signatures  

---

### 8.4 Transport Security
- HTTPS (frontend ↔ backend)  
- HTTP localhost (secured via JWT)  

---

## 9. Technology Stack

### Backend
- Node.js  
- Express  
- TypeScript  
- PKCS#11  
- Crypto module  

### Frontend
- Angular  
- TypeScript  
- Web Crypto API  

---

## 10. Deployment Architecture

### Local Backend
- Windows Service / Linux service  
- Runs on localhost  
- Uses USB token  

### Production Backend
- Cloud-hosted  
- Horizontally scalable  
- Stateless  

---

## 11. Scalability & Performance

- Stateless backend design  
- Horizontal scaling supported  
- USB token is bottleneck  
- Average signing time: 1–2 seconds  

---

## 12. Error Handling

| Scenario | Response |
|--------|--------|
| Invalid JWT | 401 |
| Expired token | 401 |
| Invalid PIN | 403 |
| USB token error | 500 |
| TSA unavailable | 503 |

---

## 13. Key Features

- Secure USB token-based signing  
- JWT-based authorization  
- Dynamic public key management  
- Zero-trust architecture  
- Backend signature verification  
- Audit logging support  

---

## 14. Conclusion

This system provides a secure, scalable, and compliant solution for DSC-based digital signing in modern web applications. By combining a local signing agent with a cloud backend, it ensures strong security while maintaining usability and scalability.

---

## Final Principle

Backend authorizes → Local signs → Backend verifies → Keys auto-update
