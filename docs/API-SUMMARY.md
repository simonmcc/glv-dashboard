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
  "skip": 0,
  "take": 25,
  "filters": [],
  "sorts": [],
  "columns": []
}
```

#### Key Parameters

- `table`: The view/data source to query (see Available Views below)
- `skip`: Pagination offset
- `take`: Number of records to return
- `filters`: Array of filter conditions
- `sorts`: Array of sort specifications
- `columns`: Array of column names to return (empty = all columns)

### 2. Data Explorer - Metadata

**Get available views, fields, and pre-built queries.**

```
POST /api/DataExplorer/GetMetadataAsync
```

Returns a list of all available dashboard views and their configurations.

```
POST /api/DataExplorer/GetMetadataAsync/{viewId}
```

Returns detailed field definitions and pre-built queries for a specific view.

### 3. Other Useful Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/GetNavigationAsync` | Get user's accessible areas/teams |
| `POST /api/GetContactDetailAsync` | Get member contact details |
| `POST /api/GetLmsDetailsAsync` | Get learning management details |
| `POST /api/GetDataAsync` | General data retrieval |
| `POST /api/UnitTeamsAndRolesListingAsync` | Get teams and roles listing |
| `POST /api/GetNotifications` | Get user notifications |

## Available Dashboard Views

### LearningComplianceDashboardView

**ID:** `07b3b8bb-e64a-ee11-be6f-6045bdc1efd7`

**Purpose:** Training compliance tracking - exactly what we need for the GLV dashboard.

This view contains:
- Volunteer learning status
- Safeguarding compliance
- Safety training compliance
- First Response skill tracking
- Growing Roots progress

### Other Available Views

| View Name | Purpose |
|-----------|---------|
| `DisclosureComplianceDashboardView` | DBS disclosure status |
| `SuspensionDashboardView` | Suspended member tracking |
| `AppointmentsDashboardView` | Appointment progress tracking |
| `TeamDirectoryReviewsDashboardView` | Team directory reviews |
| `PermitsDashboardView` | Activity permits tracking |
| `WelcomeEnquiryView` | New member enquiries |
| `PreloadedAwardsDashboardView` | Awards and recognitions |

## Pre-Built Queries

The LearningComplianceDashboardView includes these pre-built queries:

1. **Members requiring First Response skill** - All volunteers requiring First Response, whether due for renewal, overdue or expired
2. **First Response non-compliant (not suspended)** - Volunteers with expired First Response who aren't suspended
3. **Safeguarding expired** - Volunteers with expired safeguarding training
4. **Safety expired** - Volunteers with expired safety training
5. **Growing Roots incomplete** - Volunteers with outstanding joining journey learning

## Example: Query Learning Compliance

```json
POST /api/DataExplorer/GetResultsAsync
Content-Type: application/json
Authorization: Bearer <token>

{
  "table": "LearningComplianceDashboardView",
  "skip": 0,
  "take": 100,
  "filters": [],
  "sorts": [
    {
      "field": "SafeguardingExpiryDate",
      "dir": "asc"
    }
  ],
  "columns": [
    "FullName",
    "RoleName",
    "TeamName",
    "SafeguardingStatus",
    "SafeguardingExpiryDate",
    "SafetyStatus",
    "SafetyExpiryDate",
    "FirstResponseStatus",
    "FirstResponseExpiryDate"
  ]
}
```

## Available Fields (LearningComplianceDashboardView)

Based on the metadata, key fields include:

### Member Information
- `FullName` - Member's full name
- `MembershipNumber` - Unique member ID
- `RoleName` - Current role
- `TeamName` - Team/section name
- `TeamId` - Team identifier
- `RoleStartDate` - When role started

### Safeguarding
- `SafeguardingStatus` - Current status (Compliant, Expired, Due Soon, etc.)
- `SafeguardingExpiryDate` - When safeguarding training expires
- `SafeguardingCompletedDate` - When last completed

### Safety
- `SafetyStatus` - Current status
- `SafetyExpiryDate` - When safety training expires
- `SafetyCompletedDate` - When last completed

### First Response
- `FirstResponseStatus` - Current status
- `FirstResponseExpiryDate` - When First Response expires
- `FirstResponseRequired` - Whether required for role

### Learning Progress
- `GrowingRootsStatus` - Joining journey progress
- `DataProtectionStatus` - Data protection training
- `WhoWeAreStatus` - Core training module

## Filter Syntax

Filters use this structure:

```json
{
  "field": "SafeguardingStatus",
  "operator": "eq",
  "value": "Expired"
}
```

### Available Operators
- `eq` - Equals
- `neq` - Not equals
- `contains` - Contains string
- `startswith` - Starts with
- `endswith` - Ends with
- `gt` / `gte` - Greater than / or equal
- `lt` / `lte` - Less than / or equal
- `isnull` - Is null
- `isnotnull` - Is not null

## Next Steps for Implementation

1. **Build API Client** - TypeScript client that wraps these endpoints
2. **Implement Auth Flow** - Handle B2C authentication in browser/Lambda
3. **Create Compliance Queries** - Pre-built queries for common GLV needs:
   - Safeguarding expiring in next 30/60/90 days
   - Safety training overdue
   - First Response renewals needed
   - Growing Roots incomplete
4. **Build Dashboard UI** - React components to display compliance status
