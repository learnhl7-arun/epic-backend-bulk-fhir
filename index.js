import fs from 'fs'
import jose from 'node-jose'
import { randomUUID } from "crypto"
import axios from 'axios'
import hyperquest from 'hyperquest'
import ndjson from 'ndjson'
import nodemailer from 'nodemailer'
import schedule from 'node-schedule'



const tokenEndpoint = "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token"
const fhirBaseUrl = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4"
const groupId = "e3iabhmS8rsueyz7vaimuiaSmfGvi.QwjVXJANlPOgR83"

function clearScreen() {
    process.stdout.write('\x1B[2J\x1B[0f');
}

const createJWT = async (payload) => {
    const ks = fs.readFileSync('keys.json')
    const keystore = await jose.JWK.asKeyStore(ks.toString())
    const key = keystore.all({ use: 'sig' })[0]
    return jose.JWS.createSign({ compact: true, fields: { "typ": "jwt" } }, key)
        .update(JSON.stringify(payload))
        .final()
}

const generateExpiry = (minutes) => {
    return Math.round((new Date().getTime() + minutes * 60 * 1000) / 1000)
}


const makeTokenRequest = async () => {
    const jwt = await createJWT({
        "iss": clientId,
        "sub": clientId,
        "aud": tokenEndpoint,
        "jti": randomUUID(),
        "exp": generateExpiry(4)
    })

    const formParams = new URLSearchParams()
    formParams.set('grant_type', 'client_credentials')
    formParams.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    formParams.set('client_assertion', jwt)

    const tokenResponse = await axios.post(tokenEndpoint, formParams, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    })
    return tokenResponse.data
}

const kickOffBulkDataExport = async (accessToken) => {
    const bulkKickoffResponse = await axios.get(`${fhirBaseUrl}/Group/${groupId}/$export`, {
        params: {
            _type: 'patient,observation',
            _typeFilter: 'Observation?category=laboratory',
        },
        headers: {
            Accept: 'application/fhir+json',
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'respond-async'
        }
    })
    return bulkKickoffResponse.headers.get('Content-Location')
}

const pollAndWaitForExport = async (url, accessToken, secsToWait = 5) => {
    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })
        const progress = response.headers.get("X-Progress")
        const status = response.status
        const data = response.data
        
        if (status == 200) {
            return data
        }
        console.log({ progress })
        await new Promise(resolve => setTimeout(resolve, secsToWait * 1000))
        return await pollAndWaitForExport(url, accessToken, secsToWait)
    } catch (e) {
        console.log("Error trying to get Bulk Request. Retrying...");
    }

    console.log(`[${new Date().toISOString()}] waiting ${secsToWait} secs`)
    await new Promise(resolve => setTimeout(resolve, secsToWait * 1000))
    return await pollAndWaitForExport(url, accessToken, secsToWait)
}

clearScreen()
//Get the client ID from the environment
const clientId = process.env.EPIC_BACKEND_APP_CLIENT_ID
// console.log('Client ID', clientId)

const tokenResponse = await makeTokenRequest()
const accessToken = tokenResponse.access_token
const contentLocation = await kickOffBulkDataExport(accessToken)
const bulkDataResponse = await pollAndWaitForExport(contentLocation, accessToken,3)
console.log(bulkDataResponse, accessToken)
