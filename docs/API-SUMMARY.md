# Scouts Membership Portal API Summary

This document summarizes the key API endpoints discovered from the membership.scouts.org.uk portal.

## Base URL

```
https://tsa-memportal-prod-fun01.azurewebsites.net/api
```

## Authentication

All API requests require a Bearer token obtained from Azure AD B2C authentication:

```
Authorization: Bearer <token>
```

The token is obtained through the OAuth2 flow at:
```
https://prodscoutsb2c.b2clogin.com/prodscoutsb2c.onmicrosoft.com/b2c_1_signin_signup/oauth2/v2.0/authorize
```

Client ID: `5515f96e-3252-4efd-a2eb-7c6be1bba5aa`

## Key Endpoints

### 1. Data Explorer - Query Results

**The main endpoint for fetching training/compliance data.**

```
POST /api/DataExplorer/GetResultsAsync
```

#### Request Body Structure

```json
{
  "table": "LearningComplianceDashboardView",
  "query": "",
  "selectFields": [],
  "pageNo": 1,
  "pageSize": 50,
  "orderBy": "",
  "order": null,
  "distinct": true,
  "isDashboardQuery": false,
  "contactId": "<your-contact-id>",
  "id": "",
  "name": ""
}
```

#### Key Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `table` | string | The view/data source to query (see Available Views below) |
| `query` | string | SQL-like filter expression (e.g., `"Status = 'Expired'"`) |
| `selectFields` | array | Field names to return (empty = all fields) |
| `pageNo` | number | Page number (1-based) |
| `pageSize` | number | Number of records per page |
| `orderBy` | string | Field to sort by (leave empty - non-empty causes errors) |
| `order` | null | Sort direction (leave null - non-null causes errors) |
| `distinct` | boolean | Whether to return distinct records |
| `isDashboardQuery` | boolean | Set to false for direct queries |
| `contactId` | string | Your contact ID from authentication |

#### Response Structure

```json
{
  "data": [...],
  "nextPage": "",
  "count": 246,
  "aggregateResult": null,
  "error": null
}
```

### 2. Other Useful Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/GetNavigationAsync` | Get user's accessible areas/teams |
| `POST /api/GetContactDetailAsync` | Get member contact details |
| `POST /api/GetLmsDetailsAsync` | Get learning management details with accurate expiry dates |
| `POST /api/MemberListingAsync` | Search for members by membership number |
| `POST /api/GenerateSASTokenAsync` | Generate SAS token for Azure Table Storage |
| `POST /api/UnitTeamsAndRolesListingAsync` | Get teams and roles listing |
| `POST /api/GetNotifications` | Get user notifications |

## Available Dashboard Views

All views tested and working as of 2026-02-04.

### Core Compliance Views

| View Name | Records | Description |
|-----------|---------|-------------|
| `LearningComplianceDashboardView` | 246 | Training compliance tracking (Safeguarding, Safety, First Response) |
| `InProgressActionDashboardView` | 516 | **Joining journey / onboarding actions** (Declaration, References, Welcome Conversation) |
| `DisclosureComplianceDashboardView` | 2 | DBS/AccessNI disclosure status |

### Other Views

| View Name | Records | Description |
|-----------|---------|-------------|
| `AppointmentsDashboardView` | 41 | Appointment progress tracking, EDI data |
| `SuspensionDashboardView` | 0 | Suspended member tracking |
| `TeamDirectoryReviewsDashboardView` | 37 | Team directory reviews |
| `PermitsDashboardView` | 20 | Activity permits tracking (Nights Away, etc.) |
| `WelcomeEnquiryView` | 0 | New member enquiries |
| `PreloadedAwardsDashboardView` | 32 | Awards and recognitions |

## View Details

### LearningComplianceDashboardView

**Purpose:** Training compliance tracking - the core view for GLV dashboard.

**Key Fields (21 total):**
- `First name`, `Last name`, `Membership number`
- `Learning` - Module name (Safeguarding, Safety, FirstResponse, etc.)
- `Status` - Current status (In-Progress, Valid, Expired, etc.)
- `Expiry date`, `Start date`, `Days since expiry`
- `Team`, `Role`, `Unit name`, `Group`, `District`, `County`
- `Communication email`, `Suspended`

### InProgressActionDashboardView

**Purpose:** Joining journey / onboarding action items. Shows incomplete tasks for new members.

**Key Fields (29 total):**
- `First name`, `Last name`, `Membership number`
- `Category key` - Action type identifier (see below)
- `On boarding action status` - Status (Outstanding, Completed, etc.)
- `Status` - Overall status (New, Cancelled, etc.)
- `Role`, `Team`, `Unit name`, `Group`
- `Role start date`, `Completed date`

**Category Key Values:**
| Key | Display Name |
|-----|--------------|
| `signDeclaration` | Declaration |
| `referenceRequest` | References |
| `welcomeConversation` | Welcome Conversation |
| `getCriminalRecordCheck` | Criminal Record Check |
| `safeguardconfidentialEnquiryCheck` | Internal Check |
| `managerTrusteeCheck` | Trustee Eligibility Check |
| `growingRoots` | Growing Roots |
| `coreLearning` | Core Learning |

**Filtering for Incomplete Items:**
Query for `On boarding action status = 'Outstanding'` to get incomplete items.

### DisclosureComplianceDashboardView

**Purpose:** DBS/AccessNI disclosure tracking.

**Key Fields (28 total):**
- `First name`, `Surname`, `Membership number`
- `Disclosure authority` - DBS, AccessNI, etc.
- `Disclosure status` - Current status
- `Disclosure issue date`, `Disclosure expiry date`
- `Days since expiry`
- `Role`, `Team`, `Unit name`

### AppointmentsDashboardView

**Purpose:** Appointment progress and EDI (Equality, Diversity, Inclusion) data.

**Key Fields (19 total):**
- `First name`, `Last name`, `Membership number`
- `Role/Accreditation`, `Start date`, `End date`
- `Days since role Started`
- `EDI` - EDI data completion flag

### PermitsDashboardView

**Purpose:** Activity permits (Nights Away, Water Activities, etc.)

**Key Fields (27 total):**
- `First name`, `Last name`, `Membership number`
- `Permit category`, `Permit type`
- `Permit restriction details`
- `Permit expiry date`, `Permit status`

## Example Queries

### Get All Learning Compliance Records

```json
POST /api/DataExplorer/GetResultsAsync
{
  "table": "LearningComplianceDashboardView",
  "query": "",
  "selectFields": [],
  "pageNo": 1,
  "pageSize": 500,
  "orderBy": "",
  "order": null,
  "distinct": true,
  "isDashboardQuery": false,
  "contactId": "<contact-id>",
  "id": "",
  "name": ""
}
```

### Get Outstanding Joining Journey Items

```json
POST /api/DataExplorer/GetResultsAsync
{
  "table": "InProgressActionDashboardView",
  "query": "",
  "selectFields": [],
  "pageNo": 1,
  "pageSize": 500,
  "orderBy": "",
  "order": null,
  "distinct": true,
  "isDashboardQuery": false,
  "contactId": "<contact-id>",
  "id": "",
  "name": ""
}
```
Then filter client-side for `On boarding action status === 'Outstanding'`.

### Get Accurate Learning Expiry Dates

Use `GetLmsDetailsAsync` for accurate per-member learning expiry dates:

```json
POST /api/GetLmsDetailsAsync
{
  "contactId": "<member-contact-id>"
}
```

Returns modules with accurate `expiryDate` values.

### Search Member by Membership Number

```json
POST /api/MemberListingAsync
{
  "searchText": "",
  "pageNo": 1,
  "pageSize": 10,
  "filter": "membershipnumber eq '0012301455'"
}
```

### Get Disclosure from Table Storage

1. Get SAS token:
```json
POST /api/GenerateSASTokenAsync
{
  "table": "Disclosures",
  "partitionkey": "<member-contact-id>",
  "permissions": "R"
}
```

2. Fetch from returned URL with the token.

## Important Notes

1. **orderBy/order parameters**: Must be empty string and null respectively. Non-empty values cause API errors.

2. **selectFields**: Can be empty to get all fields. Specifying fields may cause errors for some views.

3. **Field names have spaces**: e.g., `First name`, `Last name`, `Membership number`, `On boarding action status`

4. **LearningComplianceDashboardView expiry dates are unreliable**: Use `GetLmsDetailsAsync` per member for accurate expiry dates.
