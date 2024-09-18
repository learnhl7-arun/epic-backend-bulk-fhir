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
const clientId = process.env.EPIC_BACKEND_APP_CLIENT_ID

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

const processBulkResponse = async (bundleResponse, accessToken, type, fn) => {
    const filteredOutputs = bundleResponse.output?.filter((output) => output.type == type)
    const promises = filteredOutputs?.map((output) => {
        const url = output.url
        return new Promise((resolve) => {
            const stream = hyperquest(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            stream.pipe(ndjson.parse()).on('data', fn)
            stream.on('error', resolve)
            stream.on('end', resolve)
        })
    })
    return await Promise.all(promises)
}

const checkIfObservationIsNormal = (resource) => {
    const value = resource?.valueQuantity?.value
    if (!resource?.referenceRange) {
        return { isNormal: false, reason: "No reference range found" }
    }
    const referenceRangeLow = resource?.referenceRange?.[0]?.low?.value
    const referenceRangeHigh = resource?.referenceRange?.[0]?.high?.value
    if (!value || !referenceRangeLow || !referenceRangeHigh) {
        return { isNormal: false, reason: "Incomplete data" }
    }
    if (value >= referenceRangeLow && value <= referenceRangeHigh) {
        return { isNormal: true, reason: "Within reference range" }
    } else {
        return { isNormal: false, reason: "Outside reference range" }
    }
}

const sendEmail = async (body) => {
    const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: 'rory.schimmel@ethereal.email',
            pass: 'rPfnw2v1q1wWNWSPKk'
        }
    });

    return await transporter.sendMail(body)
}

const main = async () => {
    //
    clearScreen()
    console.log("Running main function")

    const tokenResponse = await makeTokenRequest()
    const accessToken = tokenResponse.access_token
    const contentLocation = await kickOffBulkDataExport(accessToken)
    const bulkDataResponse = await pollAndWaitForExport(contentLocation, accessToken, 3)
    // console.log(bulkDataResponse, accessToken)

    // Fetch Patient Data from bulk data response
    const patients = {}
    await processBulkResponse(bulkDataResponse, accessToken, 'Patient', (resource)=>{
    patients[`Patient/${resource.id}`] = resource})


    // Fetch Observation Data and construct email message
    let message = `Results of lab tests in sandbox (Date: ${new Date().toISOString()})\n`
    let abnormalObservations = ``
    let normalObservations = ``
    await processBulkResponse(bulkDataResponse, accessToken, 'Observation', (resource)=>{
        const {isNormal, reason} = checkIfObservationIsNormal(resource)
        const patient = patients[resource.subject.reference]
        if (isNormal) {
        normalObservations += `${resource.code.text}: ${resource?.valueQuantity?.value}. Reason: ${reason}, Patient Name: ${patient?.name?.[0]?.text}, Patient ID: ${patient?.id}\n`
        } else {
        abnormalObservations += `${resource.code.text}. Reason: ${reason}. Patient Name: ${patient?.name?.[0]?.text}, Patient ID: ${patient?.id}\n`
        }
    })

    message += 'Abnormal Observations:\n' + abnormalObservations + '\n\n'
    message += 'Normal Observations:\n' + normalObservations

    console.log(message)

    const emailAck = await sendEmail({
        from: '"Auto Process" <autorun@test-hospital.com>', // sender address
        to: "practitioner@test-hospital.com", // list of receivers
        subject: `Lab Reports on ${new Date().toDateString()} 🔥`, // Subject line
        text: message, // html body
      })
      console.log("Email sent", emailAck)
}

main()




