# SMART on FHIR Backend Application with Epic

We will start with: Epic FHIR Sandbox Credentials

We will build: A SMART on FHIR Backend Application where the application automatically pulls data for certain patients at regular intervals and sends notifications via Email if there are abnormalities.
- Initiate this automation every 24 hours.
- Authenticate the application with the JWT credentials.
- Initiate a Bulk API call for a given patient group.
- Get all lab reports of patients in the group.
- Analyse the lab reports and send an email alert to a specific email ID if there are any abnormal lab findings.

Concepts covered:
- What is FHIR Bulk API?
- Introduction to FHIR Groups and Cohorts
- FHIR Bulk API Flow and Mechanism
- SMART on FHIR Backend Authentication Flow
- OAuth2 and JWT RFC7523 Profile
- Bulk API Request/Response with Backend Authorization
