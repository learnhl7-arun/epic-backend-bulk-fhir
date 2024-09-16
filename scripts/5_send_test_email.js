import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: "localhost",
  port: 1025,
  secure: false, // Use `true` for port 465, `false` for all other ports
  auth: {
    user: "",
    pass: "",
  },
});

const htmlContent = `
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
  <p>Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
  <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
  <img height=50 src = "https://img.freepik.com/free-vector/elephant-cartoon-style_1308-140894.jpg?t=st=1726111200~exp=1726114800~hmac=24fd3ab9c4af9288accf71bf7e0b4d040a92d874f58ad4f3721ed2896f9d12ea&w=1380">
  Welcome
  <img style = "transform: scaleX(-1)" height=50 src = "https://img.freepik.com/free-vector/elephant-cartoon-style_1308-140894.jpg?t=st=1726111200~exp=1726114800~hmac=24fd3ab9c4af9288accf71bf7e0b4d040a92d874f58ad4f3721ed2896f9d12ea&w=1380">
  <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
  <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
`;




transporter.sendMail({
  from: '"Sidharth Ramesh 👻" <learn@medblocks.com>', // sender address
  to: "participant-bootcamp@test.com", // list of receivers
  subject: "Hello from FHIR Bootcamp 🔥", // Subject line
  html: htmlContent, // html body
}).then(info => console.log(info));