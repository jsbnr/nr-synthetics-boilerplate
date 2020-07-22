/*

An example of chaining multiple requests together, using the output of one to construct the next.

You can run this locally with `node chained-requests.js` 
(be sure to `npm install` first!)

Note that running locally may trigger an unhandled promise which is handled when running in New Relic.

For further docs see https://docs.newrelic.com/docs/synthetics/new-relic-synthetics/scripting-monitors/write-synthetics-api-tests
and for api reference see https://docs.newrelic.com/docs/synthetics/new-relic-synthetics/scripting-monitors/add-custom-attributes-new-relic-synthetics-data
*/

// Configurations
const VERBOSE_LOG=true          // Control how much logging there is
const DEFAULT_TIMEOUT = 5000    // You can specify a timeout for each test, if not specified this is used.


//variables declaration, dont change these values!
let assert = require('assert');
let RUNNING_LOCALLY = false



/*
*  ========== LOCAL TESTING CONFIGURATION ===========================
*/
const IS_LOCAL_ENV = typeof $http === 'undefined';
if (IS_LOCAL_ENV) {  
    RUNNING_LOCALLY=true
    var $http = require("request");       //only for local development testing
    var $secure = {}                      //only for local development testing
    $secure.EXAMPLE_SECRET="LocalSecret"  //example of how to mimic a secure credential
    console.log("Running in local mode")
} 


/*
*  ========== HELPER FUNCTIONS =====================================
*/

/*
* log()
*
* A logger, that logs only if verbosity is enabled
*
* @param {string|object} data - the data to log out
* @param {bool} verbose - if true overrides global setting
*/
const log = function(data, verbose) {
    if(VERBOSE_LOG || verbose) { console.log(data) }
}

/*
* asyncForEach()
*
* A handy version of forEach that supports await.
* @param {Object[]} array     - An array of things to iterate over
* @param {function} callback  - The callback for each item
*/
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }
  

/*
* genericServiceCall()
* Generic service call helper for commonly repeated tasks
*
* @param {number} responseCodes  - The response code (or array of multiple codes) expected from the api call (e.g. 200 or [200,201])
* @param {Object} options       - The standard http request options object
* @param {function} success     - Call back function to run on successfule request
*/
const  genericServiceCall = function(responseCodes,options,success) {
    console.log(`${options.method}: ${options.url}`) //just so we know whats going on!

    !('timeout' in options) && (options.timeout = DEFAULT_TIMEOUT) //add a timeout if not already specified 
    let possibleResponseCodes=responseCodes
    if(typeof(responseCodes) == 'number') { //convert to array if not supplied as array
      possibleResponseCodes=[responseCodes]
    }
    return new Promise((resolve, reject) => {
        $http(options, function callback(error, response, body) {
        if(error) {
            reject(`Connection error for URL '${options.url}' `)
        } else {
            if(!possibleResponseCodes.includes(response.statusCode)) {
                let errmsg=`Expected [${possibleResponseCodes}] response code but got '${response.statusCode}' for URL '${options.url}'`
                reject(errmsg)
            } else {
                resolve(success(body,response,error))
            }
          }
        });
    })
  }

/*
* setAttribute()
* Sets a custom attribute on the synthetic record
*
* @param {string} key               - the key name
* @param {Strin|Object} value       - the value to set
*/
const setAttribute = function(key,value) {
    if(!RUNNING_LOCALLY) { //these only make sense when running on a minion
        $util.insights.set(key,value)
    } else {
        log(`Set attribute '${key}' to ${value}`)
    }
}



/*
*  ========== CHAINED REQUESTS DEFINED HERE ===========================
*/

async function chainedRequests()  {

    let success=true //used to record the overall success of the tests

    let request = {
        url: `https://run.mocky.io/v3/bf28f8c4-dd0b-4fab-9689-8022632d5c8d`, //returns a json object 
        method: 'GET',
        headers :{}
    }

    //Step 1
    await genericServiceCall(200,request,(body,response,error)=>{return body})
    
    //Step 2
    .then((data)=>{
        let someValue=JSON.parse(data).someValue //extract something from the previous response
        let request = {
            url: `https://run.mocky.io/v3/bf28f8c4-dd0b-4fab-9689-8022632d5c8d?someValue=${someValue}`, //construct url appropriately
            method: 'GET',
            headers :{}
        }
        return genericServiceCall(200,request,(body,response,error)=>{ return body })
    })

    //Step n...   add as many steps as you need!
    // .then((data)=>{
    //     let request = {
    //         url: `url`,
    //         method: 'GET',
    //         headers :{}
    //     }
    //     return genericServiceCall(200,request,(body,response,error)=>{ return body })
    // })
    
    .then((data)=>{
        console.log("Final response body from last step is:",data)
    })
    .catch((e)=>{
        console.log("ERROR! An error occcured: ",e)
        success = false
    })
    return success
}



// Start here!

try {
    chainedRequests()
    .then((success)=>{
        
        if(success === true ) {
            console.log("Completed successfully")
            assert.ok("All tests passed")           //assert a success so New Relic knows the script is ok
        } else {
            console.log("Completed with errors")
            assert.fail('Not all tests passed')     //assert a failure so New Relic knows the script failed
        }
        setAttribute("testRunComplete","YES")       //to ensure we've not timed out or broken somehow
    })
} catch(e) {
    console.log("Unexpected errors: ",e)
}
  