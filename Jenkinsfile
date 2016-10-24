#!groovy
import groovy.json.JsonSlurper 

/* Only keep the 10 most recent builds. */
properties([[$class: 'BuildDiscarderProperty',
                strategy: [$class: 'LogRotator', numToKeepStr: '10']]])

@NonCPS
def packageFileVersion() {
    def body = readFile("package.json")
    def json = new groovy.json.JsonSlurper().parseText(body)
    println json
    return json.version
}

node('docker') {
   stage 'Checkout'
   checkout scm

   stage 'Build'
   def version = packageFileVersion()
   // Run the maven build
   sh "docker build -t hipchat-dance-party-service:v\${version} ."
}
